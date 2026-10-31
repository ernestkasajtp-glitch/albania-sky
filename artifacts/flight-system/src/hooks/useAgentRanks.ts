import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

/**
 * Kthehet një Map<agentName, rank> për top 20 agjentët me shitjet më të larta (gjithsesi).
 * Vetëm për admin — për jo-admin kthehet Map bosh.
 * Cache 10 minuta (nuk rifetch me çdo render).
 */
export function useAgentRanks(): Map<string, number> {
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";

  const { data } = useQuery({
    queryKey: ["agent-ranks-all-time"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/reports/agent-sales`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      const agents: Array<{ agentName: string; totalSales: number }> =
        json?.agents ?? (Array.isArray(json) ? json : []);
      return agents
        .filter((a) => (a.totalSales ?? 0) > 0)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 20);
    },
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,  // 10 minuta
    gcTime: 30 * 60 * 1000,
  });

  return new Map((data ?? []).map((a, i) => [a.agentName, i + 1]));
}
