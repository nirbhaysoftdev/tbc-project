// src/app/forgot-password/layout.tsx
import { AuthProvider } from '@/lib/auth';

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
