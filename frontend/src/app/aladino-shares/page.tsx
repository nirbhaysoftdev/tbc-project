// src/app/aladino-shares/page.tsx - the public Aladino Shares offering.
//
// A standalone page, like the landing page: no login, no member, no portal
// layout. Content and logic live in components/aladino-shares/SharesPage.tsx.
import type { Metadata } from 'next';
import SharesPage from '@/components/aladino-shares/SharesPage';

export const metadata: Metadata = {
  title: 'Aladino Shares · TBC Members Offering',
  description: 'Exclusive members offering — book Aladino shares at €5,000 each.',
};

export default function Page() {
  return <SharesPage />;
}
