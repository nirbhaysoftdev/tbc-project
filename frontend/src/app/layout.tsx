// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/lib/auth';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trillionbc.com';
const SITE_NAME = 'Trillion Business Community';
const SITE_TITLE = 'Trillion Business Community - A Private Business community for Owners';
const SITE_DESCRIPTION =
  'A private business community where owners, operators and investors from twelve industries discover opportunities, find the partners and expertise a project needs, and build ventures together. Membership by application.';
const OG_IMAGE = '/images/tbc-logo-1.png';

// iOS picks a launch image by exact device size and shows a blank screen when
// nothing matches, so every current iPhone and iPad viewport is listed. They
// are generated from the one logo by scripts/pwa-icons.py.
const IOS_LAUNCH = ([
  // [CSS width, CSS height, device pixel ratio]
  [440, 956, 3],   // iPhone 16 Pro Max
  [430, 932, 3],   // iPhone 15/16 Plus, 14/15 Pro Max
  [428, 926, 3],   // iPhone 12/13/14 Pro Max
  [402, 874, 3],   // iPhone 16 Pro
  [393, 852, 3],   // iPhone 14 Pro, 15, 16
  [390, 844, 3],   // iPhone 12, 13, 14
  [414, 896, 3],   // iPhone XS Max, 11 Pro Max
  [375, 812, 3],   // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 2],   // iPhone XR, 11
  [375, 667, 2],   // iPhone SE, 8
  [768, 1024, 2],  // iPad 9.7"
  [820, 1180, 2],  // iPad Air
  [834, 1194, 2],  // iPad Pro 11"
  [1024, 1366, 2], // iPad Pro 12.9"
] as [number, number, number][]).map(([w, h, ratio]) => ({
  url: `/icons/launch-${w * ratio}x${h * ratio}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) `
    + `and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
}));

// The status bar and the window chrome, in the portal's own navy, so an
// installed app does not open with a white band across the top.
export const viewport: Viewport = {
  themeColor: '#0b1022',
  width: 'device-width',
  initialScale: 1,
  // Lets the page paint behind the notch and the home indicator; every fixed
  // element pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
};

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
  // Installed as an app: the name under the icon is TBC on a phone, where
  // "Trillion Business Community" would be truncated to "Trillion Busin…",
  // and the full name everywhere there is room for it.
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'TBC',
    // Translucent, so the portal's own background runs under the clock
    // instead of a grey strip above it.
    statusBarStyle: 'black-translucent',
    startupImage: IOS_LAUNCH,
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192.png',
    apple: [{ url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
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
        {/* Registers the service worker and arms the install listener. Renders
            nothing; see components/pwa/ServiceWorkerRegistrar.tsx. */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
