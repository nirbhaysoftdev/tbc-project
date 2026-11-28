// Header and footer shared by the Aladino Shares pages.
import '@/app/aladino-shares/aladino-shares.css';
import type { ReactNode } from 'react';

export function Shell({ children, admin = false, action }: { children: ReactNode; admin?: boolean; action?: ReactNode }) {
  return (
    <div className="as-root" dir="ltr">
      <header className="top">
        <div className="wrap">
          <a className="brand" href="/">
            <img src="/images/aladino-shares-logo.png" alt="TBC" width={44} height={44} />
            <div>
              <b>TRILLION BUSINESS COMMUNITY</b>
              <small>{admin ? 'Share bookings · Admin' : 'TBC Private Market · Members Offering'}</small>
            </div>
          </a>
          {action ?? <div className="tag">ALADINO <i>by</i> TBC <span>· Members Offer</span></div>}
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
              <span>An exclusive offering for members of <b>Trillion Business Community (TBC)</b></span>
              <span>Strictly for invited members · Confidential</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
