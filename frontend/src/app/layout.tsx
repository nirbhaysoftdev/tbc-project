// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trillionbc.com';
const SITE_NAME = 'Trillion Business Community';
const SITE_TITLE = 'Trillion Business Community — Where Vision Becomes Measurable Impact';
const SITE_DESCRIPTION =
  'TBC is a private global ecosystem connecting elite operators, investors, and entrepreneurs — combining community DealRooms, capital management, and cross-industry opportunity into one high-signal circle.';
const OG_IMAGE = '/images/tbc-logo-1.png';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s · Trillion Business Community',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Trillion Business Community',
    'TBC',
    'business community',
    'investors network',
    'entrepreneurs',
    'DealRoom',
    'private business network',
    'global investors',
    'C-level network',
    'syndicate',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Trillion Business Community — a private circle of elite operators, investors, and entrepreneurs.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/images/tbc-logo-1.png',
    shortcut: '/images/tbc-logo-1.png',
    apple: '/images/tbc-logo-1.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
