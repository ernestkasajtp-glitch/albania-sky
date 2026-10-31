import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getFmsDeviceId } from "@/lib/fms-device-id";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface AdminUser { id: number; email: string; name: string; role: string; }

interface AdminAuthCtx {
  user: AdminUser | null;
  loading: boolean;
  hasAdmin: boolean | null;
  permissions: Record<string, boolean>;
  hasPermission: (perm: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  requestBlockedAccess: (email: string, password: string) => Promise<string>;
  verifyBlockedAccess: (email: string, password: string, code: string) => Promise<void>;
  setup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthCtx | null>(null);

export class BlockedFmsIpError extends Error {}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const loadPermissions = async () => {
    try {
      const r = await fetch(`${API}/permissions/my`, { credentials: "include" });
      if (r.ok) setPermissions(await r.json());
      else setPermissions({});
    } catch { setPermissions({}); }
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/me`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/admin/has-admin`, { credentials: "include" }).then(r => r.json()),
    ]).then(async ([me, ha]) => {
      setUser(me);
      setHasAdmin(ha.exists);
      if (me) {
        const deviceId = getFmsDeviceId();
        if (deviceId) {
          void fetch(`${API}/admin/device`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
          }).catch(() => {});
        }
        await loadPermissions();
      }
    }).catch(() => {
      setUser(null);
      setHasAdmin(false);
    }).finally(() => setLoading(false));
  }, []);

  // Rifresko lejet kur përdoruesi rikthen fokusin te dritarja — kështu ndryshimet
  // që bën admini zbatohen pa qenë nevoja për dalje/hyrje (logout/login).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => { loadPermissions(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const completeLogin = async (u: AdminUser) => {
    setUser(u);
    setHasAdmin(true);
    const deviceId = getFmsDeviceId();
    if (deviceId) {
      void fetch(`${API}/admin/device`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }).catch(() => {});
    }
    await loadPermissions();
  };

  const postLogin = async (path: string, body: Record<string, unknown>) => {
    const r = await fetch(`${API}${path}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 403 && data.code === "FMS_IP_BLOCKED") {
        throw new BlockedFmsIpError(data.error || "Kjo IP është e bllokuar.");
      }
      throw new Error(data.error || "Veprimi dështoi.");
    }
    return data;
  };

  const login = async (email: string, password: string) => {
    const u = await postLogin("/admin/login", { email, password, deviceId: getFmsDeviceId() });
    await completeLogin(u);
  };

  const requestBlockedAccess = async (email: string, password: string): Promise<string> => {
    const data = await postLogin("/admin/access/request", { email, password });
    return data.expiresAt;
  };

  const verifyBlockedAccess = async (email: string, password: string, code: string) => {
    const u = await postLogin("/admin/access/verify", { email, password, code, deviceId: getFmsDeviceId() });
    await completeLogin(u);
  };

  const setup = async (email: string, password: string, name: string) => {
    const r = await fetch(`${API}/admin/setup`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Gabim"); }
    const u = await r.json();
    setUser(u);
    setHasAdmin(true);
    await loadPermissions();
  };

  const logout = async () => {
    await fetch(`${API}/admin/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setPermissions({});
  };

  const hasPermission = (perm: string) => {
    if (user?.role === "admin") return true;
    return permissions[perm] === true;
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, hasAdmin, permissions, hasPermission, login, requestBlockedAccess, verifyBlockedAccess, setup, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be inside AdminAuthProvider");
  return ctx;
}
