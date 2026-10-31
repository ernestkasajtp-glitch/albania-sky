import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export type EntityType = "booking" | "agent" | "flight" | "group_ticket";

export function useEntityTaskCounts(entityType: EntityType) {
  return useQuery<Record<string, number>>({
    queryKey: ["tasks-entity-counts", entityType],
    queryFn: async () => {
      const resp = await fetch(
        `${API_BASE}/tasks-meta/entity-counts?entityType=${entityType}`,
        { credentials: "include" },
      );
      if (!resp.ok) return {};
      return resp.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
