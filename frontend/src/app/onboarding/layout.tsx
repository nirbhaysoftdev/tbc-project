// src/app/onboarding/layout.tsx
// Wraps all /onboarding/* pages with auth context.
import { AuthProvider } from '@/lib/auth';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
