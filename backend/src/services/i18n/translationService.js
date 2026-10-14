// src/services/i18n/translationService.js
//
// The translation store: versioning English sources, scheduling work, reading
// translations back, and deciding when a translation is no longer trustworthy.
//
// Two rules run through everything here:
//
//   1. An admin save must never fail because of translation. Every entry point
//      called from a write path is wrapped so a provider outage, a queue error
//      or a bad row degrades to "English only" instead of a 500 on the save
//      (requirement §6, §12).
//
//   2. English is authoritative. A translation is served only when it was
//      produced from the exact English text that is live right now. The hash
//      comparison is done on READ as well as on write, so a translation cannot
//      go stale just because the job that should have marked it never ran
//      (requirement §8 "avoid returning stale translations").

const prisma = require('../../utils/prismaClient');
const { DEFAULT_LANGUAGE, TARGET_LANGUAGES, normalizeLanguage } = require('./languages');
const { fieldsOf, formatOf, isTranslatableEntity, isTranslatableField, modelOf, ENTITY_TYPES } = require('./translatable');
const { hashSource, shouldTranslate, changedFields } = require('./content');

/**
 * Record the current English state of a record and queue whatever needs
 * translating.
 *
 * Called after a successful save, inside no transaction with the save itself:
 * the English row is already committed and must stay committed regardless of
 * what happens here (§6 "Save the English source successfully" first).
 *
 * Sequence, matching §6's required ordering:
 *   1 hash every translatable field of the record
 *   2 compare against the hashes stored for the previous version
 *   3 bump the version if anything changed
 *   4 mark the old translations of the changed fields OUTDATED
 *   5 enqueue one job per (changed field × target language)
 *
 * Returns { version, changed } for callers that want to log it; never throws.
 */
async function registerSource(entityType, entityId, values, options = {}) {
  const { enqueue = true } = options;

  try {
    if (!isTranslatableEntity(entityType) || !entityId) {
      return { version: 0, changed: [] };
    }

    // Only fields in the registry, and only ones actually present on this save.
    const translatable = fieldsOf(entityType);
    const current = {};
    for (const field of translatable) {
      const value = values?.[field];
      if (value === undefined || value === null) continue;
      current[field] = hashSource(value);
    }
    if (!Object.keys(current).length) return { version: 0, changed: [] };

    const previous = await prisma.contentVersion.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      select: { version: true, fieldHashes: true },
    });

    const changed = changedFields(current, previous?.fieldHashes);

    // Nothing changed: reuse the existing translations untouched. This is the
    // path that stops an unrelated save (a status flip, a raisedAmount update)
    // from re-translating the whole record (§6.A.4, §11).
    if (previous && !changed.length) {
      return { version: previous.version, changed: [] };
    }

    const nextVersion = (previous?.version ?? 0) + 1;

    // Merge rather than replace: a save that only submits `title` must not
    // erase the recorded hash of `description`, or the next save would think
    // the description changed too.
    const mergedHashes = { ...(previous?.fieldHashes ?? {}), ...current };

    await prisma.contentVersion.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: { entityType, entityId, version: nextVersion, fieldHashes: mergedHashes },
      update: { version: nextVersion, fieldHashes: mergedHashes },
    });

    if (!changed.length) return { version: nextVersion, changed: [] };

    // Step 4 — the translations of the changed fields describe text that no
    // longer exists. They are marked OUTDATED rather than deleted so a human
    // review is not thrown away and so the admin UI can show what is lagging.
    // HUMAN_REVIEWED rows are included: a human-checked translation of deleted
    // copy is still outdated. It keeps its own status recorded in `status`
    // only after a fresh job replaces it, which is why the worker refuses to
    // overwrite HUMAN_REVIEWED (see applyResult).
    await prisma.translation.updateMany({
      where: { entityType, entityId, field: { in: changed } },
      data: { status: 'OUTDATED' },
    });

    if (enqueue) {
      await enqueueFields({
        entityType,
        entityId,
        values,
        fields: changed,
        sourceVersion: nextVersion,
      });
    }

    return { version: nextVersion, changed };
  } catch (err) {
    // Deliberately swallowed. The caller is a controller that has already
    // persisted the English source; failing its response here would mean an
    // admin cannot publish content while the translation subsystem is unwell.
    console.error('[i18n] registerSource failed', {
      entityType,
      entityId,
      message: err.message,
    });
    return { version: 0, changed: [] };
  }
}

/**
 * Queue one job per (field × target language), skipping values that are not
 * worth translating.
 *
 * The unique index on (entityType, entityId, field, language, sourceHash)
 * makes this idempotent: two concurrent saves of the same content collapse onto
 * one job row instead of translating twice (§6.A.12).
 */
async function enqueueFields({ entityType, entityId, values, fields, sourceVersion, languages }) {
  const targets = (languages ?? TARGET_LANGUAGES)
    .map(normalizeLanguage)
    .filter((l) => l && l !== DEFAULT_LANGUAGE);

  const rows = [];
  for (const field of fields) {
    const value = values?.[field];
    if (typeof value !== 'string') continue;
    // URLs, codes, enum tokens, numbers, empty strings — never sent out.
    if (!shouldTranslate(value)) continue;

    for (const language of targets) {
      rows.push({
        entityType,
        entityId,
        field,
        language,
        sourceText: value,
        sourceHash: hashSource(value),
        sourceVersion,
        format: formatOf(entityType, field),
        status: 'QUEUED',
        attempts: 0,
        runAfter: new Date(),
      });
    }
  }

  if (!rows.length) return 0;

  // skipDuplicates handles the dedupe; a conflicting row is an identical job
  // that is already queued or already done.
  const result = await prisma.translationJob.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * On-demand translation for content that has none (§6.A.11).
 *
 * Used when a read finds no usable translation: the request still returns
 * English immediately, and the job runs in the background so the next read
 * has it. Nothing about the response waits on this.
 */
async function requestTranslation({ entityType, entityId, field, value, language }) {
  try {
    const lang = normalizeLanguage(language);
    if (!lang || lang === DEFAULT_LANGUAGE) return false;
    if (!isTranslatableField(entityType, field)) return false;
    if (!shouldTranslate(value)) return false;

    const version = await prisma.contentVersion.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      select: { version: true },
    });

    const count = await enqueueFields({
      entityType,
      entityId,
      values: { [field]: value },
      fields: [field],
      sourceVersion: version?.version ?? 1,
      languages: [lang],
    });
    return count > 0;
  } catch (err) {
    console.error('[i18n] requestTranslation failed', { entityType, entityId, field, message: err.message });
    return false;
  }
}

/**
 * Fetch usable translations for a set of records in one query.
 *
 * "Usable" means: the right language, a status that is not OUTDATED or FAILED,
 * and — critically — a `sourceHash` matching the English text the caller
 * actually holds. The hash check is why a stale translation cannot be served
 * even if its status was never updated.
 *
 * Shape: { [entityId]: { [field]: { value, status, format } } }
 */
async function getTranslationMap({ entityType, entityIds, language }) {
  const lang = normalizeLanguage(language);
  if (!lang || lang === DEFAULT_LANGUAGE) return {};
  if (!isTranslatableEntity(entityType)) return {};

  const ids = [...new Set((entityIds || []).filter(Boolean))];
  if (!ids.length) return {};

  try {
    const rows = await prisma.translation.findMany({
      where: {
        entityType,
        entityId: { in: ids },
        language: lang,
        // FAILED and OUTDATED rows are kept for diagnostics and for the admin
        // view, but are never served.
        status: { in: ['MACHINE', 'HUMAN_REVIEWED'] },
      },
      select: {
        entityId: true,
        field: true,
        value: true,
        status: true,
        format: true,
        sourceHash: true,
        provider: true,
      },
    });

    const map = {};
    for (const row of rows) {
      if (!map[row.entityId]) map[row.entityId] = {};
      map[row.entityId][row.field] = row;
    }
    return map;
  } catch (err) {
    // A failed lookup must degrade to English, not to an error response: §12
    // requires that a translation problem cannot break an unrelated workflow.
    console.error('[i18n] getTranslationMap failed', { entityType, language: lang, message: err.message });
    return {};
  }
}

/**
 * Apply a translation map to one record.
 *
 * Returns a NEW object; the record passed in (and therefore the English source
 * a caller may still need) is never mutated.
 *
 * Adds a `_i18n` descriptor so a client can tell what it is looking at:
 *   language   the language actually served
 *   fields     per-field 'translated' | 'english'
 *   machine    true when any served field is unreviewed machine output
 * Requirement §6.A.14 and §12 ask for machine output to be identifiable.
 */
function applyTranslations(entityType, record, translationsForRecord, language) {
  if (!record || typeof record !== 'object') return record;

  const lang = normalizeLanguage(language) || DEFAULT_LANGUAGE;
  const out = { ...record };
  const fieldStates = {};
  let anyMachine = false;
  let anyTranslated = false;

  for (const field of fieldsOf(entityType)) {
    const source = record[field];
    if (typeof source !== 'string' || !source) continue;

    const hit = translationsForRecord?.[field];
    // The hash gate: serve the translation only if it was made from exactly
    // this English text.
    const usable = hit && hit.sourceHash === hashSource(source) && hit.value;

    if (usable) {
      out[field] = hit.value;
      fieldStates[field] = 'translated';
      anyTranslated = true;
      if (hit.status === 'MACHINE') anyMachine = true;
    } else {
      fieldStates[field] = 'english';
    }
  }

  if (lang !== DEFAULT_LANGUAGE) {
    out._i18n = {
      language: lang,
      // `true` only when everything translatable on this record is translated.
      complete: Object.values(fieldStates).every((s) => s === 'translated'),
      translated: anyTranslated,
      machine: anyMachine,
      fields: fieldStates,
    };
  }

  return out;
}

/**
 * Localise a list of records of one entity type.
 *
 * One query for the whole list rather than one per record, which is what keeps
 * a 12-item deal-room page at two queries instead of twenty-five.
 *
 * `onMissing: 'queue'` enqueues background work for anything untranslated, so
 * browsing a page in Italian is itself what populates it. Off by default
 * because an unauthenticated or high-traffic endpoint should not be able to
 * generate work (§13 "do not let public users trigger unlimited translation
 * jobs").
 */
async function localizeMany(entityType, records, language, options = {}) {
  const { onMissing = 'ignore', idKey = 'id' } = options;

  const lang = normalizeLanguage(language);
  if (!lang || lang === DEFAULT_LANGUAGE) return records;
  if (!Array.isArray(records) || !records.length) return records;
  if (!isTranslatableEntity(entityType)) return records;

  const map = await getTranslationMap({
    entityType,
    entityIds: records.map((r) => r?.[idKey]),
    language: lang,
  });

  const localised = records.map((record) =>
    applyTranslations(entityType, record, map[record?.[idKey]], lang),
  );

  if (onMissing === 'queue') {
    // Fire-and-forget: never awaited, never allowed to reject into the
    // response path (§11 "avoid blocking page rendering").
    setImmediate(() => {
      Promise.all(
        localised.flatMap((record, i) => {
          const states = record?._i18n?.fields || {};
          return Object.entries(states)
            .filter(([, state]) => state === 'english')
            .map(([field]) =>
              requestTranslation({
                entityType,
                entityId: records[i]?.[idKey],
                field,
                value: records[i]?.[field],
                language: lang,
              }),
            );
        }),
      ).catch(() => {});
    });
  }

  return localised;
}

/** Single-record convenience wrapper around localizeMany. */
async function localizeOne(entityType, record, language, options = {}) {
  if (!record) return record;
  const [out] = await localizeMany(entityType, [record], language, options);
  return out;
}

/**
 * Mark a translation as human-reviewed (§6.A.14, §12).
 *
 * A HUMAN_REVIEWED row is never overwritten by a machine job, which is what
 * makes human review durable for the legal, financial and contractual copy
 * §12 calls out.
 */
async function markReviewed({ entityType, entityId, field, language, value, reviewerId }) {
  const lang = normalizeLanguage(language);
  if (!lang || lang === DEFAULT_LANGUAGE) {
    throw new Error('A review target must be one of the non-English languages');
  }
  if (!isTranslatableField(entityType, field)) {
    throw new Error(`${entityType}.${field} is not translatable`);
  }

  const data = {
    status: 'HUMAN_REVIEWED',
    reviewedBy: reviewerId || null,
    reviewedAt: new Date(),
  };
  if (typeof value === 'string' && value.trim()) data.value = value;

  return prisma.translation.update({
    where: {
      entityType_entityId_field_language: { entityType, entityId, field, language: lang },
    },
    data,
  });
}

/**
 * Delete translations and version rows whose entity no longer exists.
 *
 * `entityId` cannot be a foreign key across six tables, so cascade deletion is
 * not available and orphans are swept instead (§7 "consider cascade deletion
 * and orphan cleanup"). Called from the worker on a long interval, and safe to
 * run by hand.
 */
async function pruneOrphans() {
  const summary = {};

  for (const entityType of ENTITY_TYPES) {
    const model = modelOf(entityType);
    if (!model || !prisma[model]) continue;

    try {
      const referenced = await prisma.translation.findMany({
        where: { entityType },
        select: { entityId: true },
        distinct: ['entityId'],
      });
      const ids = referenced.map((r) => r.entityId);
      if (!ids.length) continue;

      const alive = await prisma[model].findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const aliveSet = new Set(alive.map((r) => r.id));
      const dead = ids.filter((id) => !aliveSet.has(id));
      if (!dead.length) continue;

      const [translations, versions, jobs] = await Promise.all([
        prisma.translation.deleteMany({ where: { entityType, entityId: { in: dead } } }),
        prisma.contentVersion.deleteMany({ where: { entityType, entityId: { in: dead } } }),
        prisma.translationJob.deleteMany({ where: { entityType, entityId: { in: dead } } }),
      ]);
      summary[entityType] = {
        translations: translations.count,
        versions: versions.count,
        jobs: jobs.count,
      };
    } catch (err) {
      console.error('[i18n] pruneOrphans failed', { entityType, message: err.message });
    }
  }

  return summary;
}

/** Queue and coverage counters, for the admin view and for diagnostics. */
async function getStats() {
  const [jobsByStatus, translationsByStatus, queueDepth] = await Promise.all([
    prisma.translationJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.translation.groupBy({ by: ['status', 'language'], _count: { _all: true } }),
    prisma.translationJob.count({ where: { status: { in: ['QUEUED', 'FAILED'] } } }),
  ]);

  return {
    queueDepth,
    jobs: jobsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    translations: translationsByStatus.map((r) => ({
      status: r.status,
      language: r.language,
      count: r._count._all,
    })),
  };
}

module.exports = {
  registerSource,
  enqueueFields,
  requestTranslation,
  getTranslationMap,
  applyTranslations,
  localizeMany,
  localizeOne,
  markReviewed,
  pruneOrphans,
  getStats,
};
