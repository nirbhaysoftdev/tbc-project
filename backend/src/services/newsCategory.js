// src/services/newsCategory.js
//
// A one-word label for a story ("Markets", "Technology"...). Feeds do not
// carry a usable category - each publisher has its own taxonomy - so this reads
// the headline and snippet. It is a label for browsing, derived on every read
// and never stored, so improving the rules needs no migration and no backfill.
// First match wins, so the order is the priority; anything unmatched is plain
// "Business" rather than a guess.
const RULES = [
  ['Technology', /\b(ai|a\.i\.|artificial intelligence|tech|software|chip|chips|semiconductor|nvidia|openai|microsoft|apple|google|meta|amazon|tesla|cyber|robot|data ?cent(er|re)|cloud|startup)\b/i],
  ['Energy',     /\b(oil|gas|energy|opec|crude|renewable|solar|wind ?power|electricity|power grid|fuel|petrol)\b/i],
  ['Markets',    /\b(stocks?|shares?|markets?|wall street|dow|nasdaq|s&p|ftse|dax|nikkei|index|rally|sell-?off|bond|yields?|investors?|trading|traders?)\b/i],
  ['Economy',    /\b(economy|economic|inflation|gdp|recession|interest rates?|rate (hike|cut)|central bank|fed|bank of england|ecb|jobs|unemployment|wages|tariffs?|trade|budget|tax)\b/i],
  ['Investment', /\b(invest(s|ment|ing)?|funding|ipo|venture|acquisition|acquire[sd]?|merger|takeover|buyout|deal|stake|raises?)\b/i],
];

function categoryOf(title = '', summary = '') {
  const text = `${title} ${summary || ''}`;
  for (const [name, re] of RULES) if (re.test(text)) return name;
  return 'Business';
}

/**
 * Some publishers serve a thumbnail and encode its size in the path. BBC's is
 * 240px wide, which is a smear on a feature card; the same path at 800 is
 * a real image. Signed URLs (The Guardian's) are left alone: altering them
 * would invalidate the signature.
 */
function betterImage(url) {
  if (!url) return null;
  return url.replace('/ace/standard/240/', '/ace/standard/800/');
}

module.exports = { categoryOf, betterImage };
