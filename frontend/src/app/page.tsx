// src/app/page.tsx - Landing page
//
// Story order:
//   01 WOW          Hero - the room itself
//   02 WHAT IS IT   Plain definition of the community
//   02B ADVANTAGES  Institutional privileges: banking, insurance, mobility, health & media
//   03 COMMUNITY    The twelve industries - the page's main character
//   05 WHY JOIN     Concrete outcomes for a business owner
//   06 HOW IT WORKS Discover → Connect → Collaborate → Create → Grow
//   04 PARTNERS     Proof, early - businesses already inside
//   07 SCENARIO     One opportunity, six businesses
//   07B PROFIT      Universal Profit - the proposed profit-sharing framework
//   08 INSIDE       What membership opens
//   09 JOIN         Apply
//
// Content lives in src/lib/landing-data.ts; styles in src/app/landing.css;
// the motion vocabulary in src/components/landing/motion.tsx.

import './landing.css';

import Backdrop from '@/components/landing/Backdrop';
import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import WhatItIs from '@/components/landing/WhatItIs';
import GlobalReach from '@/components/landing/GlobalReach';
import WhyJoin from '@/components/landing/WhyJoin';
import HowItWorks from '@/components/landing/HowItWorks';
import Scenario from '@/components/landing/Scenario';
import Community from '@/components/landing/Community';
import Partners from '@/components/landing/Partners';
import Profit from '@/components/landing/Profit';
import Inside from '@/components/landing/Inside';
import Faq from '@/components/landing/Faq';
import FinalCta from '@/components/landing/FinalCta';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="lp-root">
      <a href="#what" className="lp-skip">
        Skip to content
      </a>

      <Backdrop />
      <Nav />

      <main>
        <Hero />
        <WhatItIs />
        <GlobalReach />
        <Community />
        <WhyJoin />
        <HowItWorks />
        <Partners />
        <Scenario />
        <Profit />
        <Inside />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
