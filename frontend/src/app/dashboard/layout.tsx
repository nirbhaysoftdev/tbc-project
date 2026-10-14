// src/app/dashboard/layout.tsx
//
// No AuthProvider here. There is exactly one, in the root layout
// (src/app/layout.tsx), and it is the single source of truth for who is signed
// in. Mounting a second one per route group gave each group its own
// independent copy of the session: signing in on /login updated that group's
// provider only, so any page outside a group — /projects, /companies — read
// the root provider, still saw `user: null`, and bounced to /login while the
// token was perfectly valid.
import ProtectedLayout from '@/components/layout/ProtectedLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
