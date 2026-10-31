import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export interface FmsModule {
  id: string;
  label: string;
  description: string;
  paths: string[];
  enabled: boolean;
  locked: boolean;
  reason?: string;
}

interface ModulesResponse {
  modules: FmsModule[];
  revision: number;
}

const moduleQueryKey = (userId: number) => ["modules", userId] as const;

function parseModules(value: unknown): ModulesResponse {
  if (!value || typeof value !== "object" || !Array.isArray((value as ModulesResponse).modules) ||
      !(value as ModulesResponse).modules.length ||
      typeof (value as ModulesResponse).revision !== "number" ||
      !(value as ModulesResponse).modules.every((item: FmsModule) =>
        item && typeof item.id === "string" && typeof item.label === "string" &&
        typeof item.description === "string" && Array.isArray(item.paths) &&
        item.paths.every(path => typeof path === "string" && path.startsWith("/")) &&
        typeof item.enabled === "boolean" && typeof item.locked === "boolean")) {
    throw new Error("Lista e moduleve nuk është e vlefshme.");
  }
  return value as ModulesResponse;
}

async function readResponse(response: Response): Promise<ModulesResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Modulet nuk u ngarkuan (${response.status}).`);
  }
  return parseModules(await response.json());
}

interface ModulesContextValue {
  modules: FmsModule[];
  loading: boolean;
  error: string | null;
  isPathEnabled: (path: string) => boolean;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  saving: boolean;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: ReactNode }) {
  const { user } = useAdminAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (userId == null) queryClient.removeQueries({ queryKey: ["modules"] });
  }, [userId, queryClient]);
  const query = useQuery({
    queryKey: moduleQueryKey(userId ?? 0),
    queryFn: async () => readResponse(await fetch(`${API_BASE}/modules`, { credentials: "include", cache: "no-store" })),
    enabled: userId != null,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      readResponse(await fetch(`${API_BASE}/modules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })),
    onSuccess: response => {
      if (userId != null) queryClient.setQueryData(moduleQueryKey(userId), response);
    },
  });

  // Në mungesë të një përgjigjeje të vlefshme, asnjë faqe e kontrolluar nuk hapet.
  const modules = userId != null && !query.isError ? query.data?.modules ?? [] : [];
  const isPathEnabled = (path: string) => {
    const normalizedPath = path.split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, "") || "/";
    if (normalizedPath === "/settings" || normalizedPath.startsWith("/settings/")) return true;
    if (!query.data || query.isError || userId == null) return false;
    const matched = modules.filter(module =>
      module.paths.some(rawPrefix => {
        const prefix = rawPrefix.split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, "") || "/";
        return prefix === normalizedPath || (prefix !== "/" && normalizedPath.startsWith(prefix + "/"));
      }));
    // Rrugët që nuk janë në katalog nuk kufizohen nga kontrolli i moduleve.
    return matched.every(module => module.enabled);
  };

  return <ModulesContext.Provider value={{
    modules,
    loading: userId != null && query.isPending,
    error: query.isError ? (query.error?.message || "Modulet nuk u ngarkuan.") : null,
    isPathEnabled,
    setEnabled: async (id, enabled) => { await mutation.mutateAsync({ id, enabled }); },
    saving: mutation.isPending,
  }}>{children}</ModulesContext.Provider>;
}

export function useModules() {
  const context = useContext(ModulesContext);
  if (!context) throw new Error("useModules must be inside ModulesProvider");
  return context;
}