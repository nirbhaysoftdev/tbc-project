"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DevNotice from "./DevNotice";
import { SidebarProvider } from "@/lib/sidebar";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedLayout({
  children,
  requireAdmin = false,
}: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ✅ Allowed routes for admin (wallet system)
  const ADMIN_ALLOWED = [
    "/admin",
    "/admin/withdrawals",
    "/settings",
    "/transactions",
    "/community",
  ];

  useEffect(() => {
    if (loading) return;

    // 🔐 Not logged in
    if (!user) {
      router.replace("/login");
      return;
    }

    // ⏳ PENDING user — redirect to onboarding flow
    if (user.status === "PENDING" && user.role !== "ADMIN") {
      if (!pathname.startsWith("/onboarding")) {
        router.replace("/onboarding/pending");
      }
      return;
    }

    // 🚫 Admin trying to access restricted pages
    if (
      user.role === "ADMIN" &&
      !ADMIN_ALLOWED.some((path) => pathname.startsWith(path))
    ) {
      router.replace("/admin");
      return;
    }

    // 🚫 Member trying to access admin pages
    if (requireAdmin && user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
  }, [user, loading, pathname, requireAdmin, router]);

  // ⏳ Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // 🚫 Block render if unauthorized
  if (!user) return null;
  if (user.status === "PENDING" && user.role !== "ADMIN") return null;
  if (requireAdmin && user.role !== "ADMIN") return null;

  return (
    <SidebarProvider>
      <div className="app-layout">
        <Sidebar />

        <div className="main-area">
          <DevNotice position="top" />
          <Topbar />

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="content-wrap" style={{ flex: 1 }}>
              {children}
            </div>

            <DevNotice position="bottom" />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}