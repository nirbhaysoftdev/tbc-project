// src/app/onboarding/layout.tsx
//
// A pass-through. Auth context comes from the single AuthProvider in the root
// layout (src/app/layout.tsx) — a second one here would be a separate copy of
// the session, which is the bug that sent signed-in members to /login from
// /projects and /companies.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
