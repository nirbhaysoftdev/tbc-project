// Header and footer shared by the Aladino Shares pages.
import '@/app/aladino-shares/aladino-shares.css';
import type { ReactNode } from 'react';
import type { Offering } from '@/lib/aladinoShares';

export type Lang = 'en' | 'it';

const CHROME = {
  en: {
    sub: 'TBC Private Market · Members Offering', offer: 'Members Offer',
    foot: 'An exclusive offering for members of', conf: 'Strictly for invited members · Confidential',
  },
  it: {
    sub: 'TBC Private Market · Offerta riservata ai soci', offer: 'Offerta ai soci',
    foot: 'Un’offerta esclusiva per i membri di', conf: 'Riservato ai membri invitati · Confidenziale',
  },
};

// `lang` + `onLang` are passed by the public page only; the admin never sets them.
export function Shell({ children, admin = false, action, lang = 'en', onLang, offering = 'aladino' }: {
  children: ReactNode; admin?: boolean; action?: ReactNode; lang?: Lang; onLang?: (l: Lang) => void; offering?: Offering;
}) {
  const c = CHROME[lang];
  return (
    <div className="as-root" dir="ltr" lang={lang}>
      <header className="top">
        <div className="wrap">
          <a className="brand" href="/">
            <img src="/images/aladino-shares-logo.png" alt="TBC" width={44} height={44} />
            <div>
              <b>TRILLION BUSINESS COMMUNITY</b>
              <small>{admin ? 'Share bookings · Admin' : c.sub}</small>
            </div>
          </a>
          {action ?? <div className="tag">{offering === 'aladino' ? 'ALADINO' : (lang === 'it' ? 'IMMOBILIARE' : 'REAL ESTATE')} <i>by</i> TBC <span>· {c.offer}</span></div>}
          {onLang && (
            <div className="lang" role="group" aria-label="Language">
              {(['en', 'it'] as Lang[]).map((l) => (
                <button key={l} type="button" className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => onLang(l)}>
                  {l === 'en' ? 'EN' : 'IT'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <main><div className="wrap">{children}</div></main>
      <footer>
        <div className="wrap">
          {admin ? (
            <>
              <span>Admin · <b>Trillion Business Community (TBC)</b></span>
              <span>Confidential</span>
            </>
          ) : (
            <>
              <span>{c.foot} <b>Trillion Business Community (TBC)</b></span>
              <span>{c.conf}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
