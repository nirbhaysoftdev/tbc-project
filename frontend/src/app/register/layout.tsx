// src/app/register/layout.tsx
import { AuthProvider } from '@/lib/auth';

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
