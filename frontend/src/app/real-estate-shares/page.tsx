// src/app/real-estate-shares/page.tsx - the public Real Estate share offering.
//
// Same page and same API as /aladino-shares, with its own share pool; bookings
// are tagged "real-estate" and appear in the one Aladino Shares admin.
import type { Metadata } from 'next';
import SharesPage from '@/components/aladino-shares/SharesPage';

export const metadata: Metadata = {
  title: 'Real Estate Shares · TBC Members Offering',
  description: 'Exclusive members offering — book real estate shares at €10,000 each.',
};

export default function Page() {
  return <SharesPage offering="real-estate" />;
}
