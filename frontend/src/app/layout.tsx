// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/lib/auth';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trillionbc.com';
const SITE_NAME = 'Trillion Business Community';
const SITE_TITLE = 'Trillion Business Community - A Private Business community for Owners';
const SITE_DESCRIPTION =
  'A private business community where owners, operators and investors from twelve industries discover opportunities, find the partners and expertise a project needs, and build ventures together. Membership by application.';
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
    'business community',
    'business owners',
    'membership community',
    'business partnerships',
    'business collaboration',
    'business opportunities',
    'investors and entrepreneurs',
    'Deal Room',
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
        alt: 'Trillion Business Community - a private business community for owners, operators and investors.',
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
    // `lang` and `dir` are the English defaults that the static export ships in
    // the prerendered HTML. I18nProvider rewrites both on <html> as soon as the
    // language is resolved on the client, which is also what flips every CSS
    // logical property for Persian and Arabic. See src/i18n/I18nProvider.tsx.
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/*
          I18nProvider wraps the entire application — every page, every layout,
          every component — so translations and the resolved direction are
          available everywhere without a single page being duplicated per
          language. It sits ABOVE AuthProvider (which each page mounts) so a
          signed-in user's saved locale can be pushed into it from there.
        */}
        <I18nProvider><AuthProvider>{children}</AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
