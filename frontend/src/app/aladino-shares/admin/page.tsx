// src/app/aladino-shares/admin/page.tsx - the Aladino Shares admin.
// Its own login (not a portal account); see backend services/aladinoShares.js.
import type { Metadata } from 'next';
import SharesAdmin from '@/components/aladino-shares/SharesAdmin';

export const metadata: Metadata = {
  title: 'Admin · Aladino Share Bookings',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SharesAdmin />;
}
