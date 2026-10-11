'use client';
// src/lib/adminAlerts.tsx
// Shared poll for the admin notification badge. Mounted once per admin page
// tree so the sidebar, topbar and tab bar all read the same numbers.
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { adminAPI } from '@/lib/api';

export type AdminAlerts = {
  newMembers: number;
  investmentRequests: number;
  withdrawRequests: number;
  total: number;
};

const EMPTY: AdminAlerts = { newMembers: 0, investmentRequests: 0, withdrawRequests: 0, total: 0 };

const Ctx = createContext<{ alerts: AdminAlerts; refresh: () => void }>({
  alerts: EMPTY,
  refresh: () => {},
});

export function AdminAlertsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AdminAlerts>(EMPTY);

  const isAdmin = user?.role === 'ADMIN';

  const refresh = () => {
    if (!isAdmin) return;
    adminAPI.getNotifications()
      .then(r => setAlerts({ ...EMPTY, ...r.data }))
      .catch(() => {});
  };

  useEffect(() => {
    if (!isAdmin) { setAlerts(EMPTY); return; }
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [isAdmin]);

  return <Ctx.Provider value={{ alerts, refresh }}>{children}</Ctx.Provider>;
}

export const useAdminAlerts = () => useContext(Ctx);
