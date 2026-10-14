"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { SidebarProvider } from "@/lib/sidebar";
import { AdminAlertsProvider } from "@/lib/adminAlerts";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedLayout({
  children,
  requireAdmin = false,
}: Props) {
  const { user, loading, hasToken, authError, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Allowed routes for admin (wallet system)
  const ADMIN_ALLOWED = [
    "/admin",
    "/admin/withdrawals",
    "/settings",
    "/transactions",
    "/community",
    // The project and company modules are admin-managed, so an admin must be
    // able to reach them. This is a `startsWith` allowlist, so each entry also
    // covers that module's /new, /detail and /edit pages.
    "/projects",
    "/companies",
  ];

  useEffect(() => {
    if (loading) return;

    // Genuinely signed out: no credential at all. `!user` on its own is NOT
    // that — it is also what a failed /auth/me looks like, and redirecting on
    // it bounced members to /login while their session was still valid. The
    // provider discards the token itself when the API rejects it, so a missing
    // token here is the real, settled answer.
    if (!user && !hasToken) {
      router.replace("/login");
      return;
    }

    // A credential exists but the user could not be fetched. Nothing to guard
    // on yet; the branch below renders a retry instead of navigating away.
    if (!user) return;

    // PENDING user - redirect to onboarding flow
    if (user.status === "PENDING" && user.role !== "ADMIN") {
      if (!pathname.startsWith("/onboarding")) {
        router.replace("/onboarding/pending");
      }
      return;
    }

    // Admin trying to access restricted pages
    if (
      user.role === "ADMIN" &&
      !ADMIN_ALLOWED.some((path) => pathname.startsWith(path))
    ) {
      router.replace("/admin");
      return;
    }

    // Member trying to access admin pages
    if (requireAdmin && user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
  }, [user, loading, hasToken, pathname, requireAdmin, router]);

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // The credential is there but /auth/me did not answer — the API is down or
  // unreachable. Shown as what it is, with a way to retry, rather than as a
  // login page: the member is not signed out and sending them to /login would
  // suggest they were.
  if (!user && hasToken) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                    height: "100vh", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          {authError ? (
            <>
              <p style={{ color: "var(--text-primary)", fontSize: 15, marginBottom: 8 }}>
                Could not reach the server
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
                You are still signed in. This is a connection problem, not a sign-out.
              </p>
              <button type="button" className="btn-primary" onClick={() => refresh()}>
                Try again
              </button>
            </>
          ) : (
            <div className="spinner" />
          )}
        </div>
      </div>
    );
  }

  // Block render if unauthorized
  if (!user) return null;
  if (user.status === "PENDING" && user.role !== "ADMIN") return null;
  if (requireAdmin && user.role !== "ADMIN") return null;

  return (
    <SidebarProvider>
      <AdminAlertsProvider>
      <div className="app-layout">
        <Sidebar />

        <div className="main-area">
          <Topbar />

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="content-wrap" style={{ flex: 1 }}>
              {children}
            </div>
          </div>
        </div>
      </div>
      </AdminAlertsProvider>
    </SidebarProvider>
  );
}