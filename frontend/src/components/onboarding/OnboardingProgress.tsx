'use client';
// src/components/onboarding/OnboardingProgress.tsx
//
// The four-step onboarding rail, previously duplicated as literal markup in
// each of the three onboarding pages. Extracted during the i18n migration
// because translating the same four labels in three places invites drift, and
// because the step numeral has to be formatted per locale rather than typed as
// an ASCII digit.
//
// This is not a redesign: the markup and class names are unchanged, so the
// rendered result is identical to what each page produced before.

import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '@/i18n/I18nProvider';

export type OnboardingStep = 'register' | 'profile' | 'kyc' | 'review';

const STEPS: OnboardingStep[] = ['register', 'profile', 'kyc', 'review'];

interface Props {
  /** The step the member is currently on. */
  current: OnboardingStep;
  /** Steps completed beyond the current one, e.g. KYC already submitted. */
  done?: OnboardingStep[];
}

export default function OnboardingProgress({ current, done = [] }: Props) {
  const { t } = useTranslation('auth');
  const { locale } = useI18n();

  const currentIndex = STEPS.indexOf(current);

  return (
    <div className="onboarding-progress">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex || done.includes(step);
        const isActive = step === current && !done.includes(step);

        return (
          // The key belongs on the Fragment, not the children: each iteration
          // emits a connector and a step, and React needs one key per element
          // of the mapped list.
          <Fragment key={step}>
            {i > 0 && (
              <div
                className={`ob-step-line ${i <= currentIndex || isDone ? 'ob-step-line--done' : ''}`}
              />
            )}
            <div
              className={`ob-step ${isDone ? 'ob-step--done' : ''} ${isActive ? 'ob-step--active' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Intl formats the numeral for the locale: Persian and Arabic
                  use their own digit shapes, and forcing "1" would look
                  foreign inside otherwise fully localised text. */}
              {new Intl.NumberFormat(locale).format(i + 1)} {t(`onboarding.steps.${step}`)}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
