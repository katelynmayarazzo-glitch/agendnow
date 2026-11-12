import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Business, Role, User } from "./types";

interface AuthState {
  user: User | null;
  business: Business | null;
  role: Role | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setBusiness: (b: Business) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await api.getUser();
      setUser(u);
      const b = u ? await api.getMyBusiness() : null;
      setBusiness(b);
      setRole(b ? await api.getMyRole(b.id).catch(() => null) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setBusiness(null);
    setRole(null);
  }, []);

  return <Ctx.Provider value={{ user, business, role, loading, refresh, setBusiness, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
