// src/app/login/layout.tsx
//
// Deliberately a pass-through. The one AuthProvider lives in the root layout
// (src/app/layout.tsx); a second one here would give this route its own copy
// of the session, which is the bug that sent signed-in members to /login from
// /projects and /companies.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
