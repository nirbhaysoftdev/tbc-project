'use client';
// src/app/community/layout.tsx
//
// The community pages now sit inside the same app shell as every other
// authenticated page, so the left sidebar — Projects, Companies, Community,
// Settings and the rest — is present on the feed, the deal room, the member
// directory, events and messages.
//
// Before this, these pages rendered their own full-width top nav and nothing
// else, which meant stepping into /community was a one-way door: there was no
// way to reach Projects or Companies without editing the URL.
//
// `CommunityNav` stays, in its `subnav` variant: the community's five sections
// are its own navigation and still need a home. The identity, language and
// log-out controls it used to carry are dropped there, because the sidebar and
// topbar already provide them and two avatars on one screen is just confusing.
//
// The auth guard that used to live here is gone too — ProtectedLayout already
// does exactly that, and having both meant two components racing to redirect.
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import CommunityNav from '@/components/community/CommunityNav';

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedLayout>
      <div className="comm-shell">
        <CommunityNav variant="subnav" />
        {/* `.content-wrap` above is `overflow: hidden`, so the scrolling
          * container has to be here — the same arrangement `.content-left`
          * uses on the dashboard. */}
        <div className="comm-shell-scroll">{children}</div>
      </div>
    </ProtectedLayout>
  );
}
