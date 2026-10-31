import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { campaignListSchema, campaignSchema, discountQueryKey, editableFields, type CampaignFields } from "@/lib/discountCampaigns";
import { matchesLiveTopics } from "@/lib/liveQueryScope";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
export class CampaignApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}/discount-campaigns${path}`, {
    method, credentials: "include", signal, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown;
  try { json = await response.json(); } catch { throw new CampaignApiError("Përgjigje e pavlefshme nga serveri. Rifresko dhe kontrollo gjendjen para se të riprovosh.", response.status); }
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(json);
    throw new CampaignApiError(error.success ? error.data.error : `Kërkesa dështoi (${response.status})`, response.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new CampaignApiError("Përgjigje e pavlefshme nga serveri. Rifresko dhe kontrollo gjendjen para se të riprovosh.", response.status);
  return parsed.data;
}
export function useDiscountCampaigns() {
  return useQuery({ queryKey: discountQueryKey, queryFn: ({ signal }) => request("", campaignListSchema, "GET", undefined, signal),
    staleTime: 30_000, refetchOnMount: "always", refetchOnWindowFocus: "always" });
}
export function useSaveDiscountCampaign() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ predicate: q => matchesLiveTopics(q.queryKey, new Set(["discounts", "flights"])) });
  return useMutation({
    mutationFn: async ({ fields, id, version, creationToken }: { fields: CampaignFields; id?: string; version?: number; creationToken?: string }) => {
      const result = await request(id ? `/${encodeURIComponent(id)}` : "", z.object({ campaign: campaignSchema }), id ? "PUT" : "POST",
        { ...editableFields(fields), ...(id ? { version } : { creationToken }) });
      if (id && (result.campaign.id !== id || version === undefined || result.campaign.version <= version)) {
        throw new CampaignApiError("Serveri nuk konfirmoi versionin e ri të fushatës. Rifresko dhe kontrollo gjendjen para se të riprovosh.", 200);
      }
      return result;
    },
    onSuccess: refresh,
    onError: error => { if (error instanceof CampaignApiError && error.status === 409) void refresh(); },
  });
}
export function useDeleteDiscountCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => request(`/${encodeURIComponent(id)}`, z.object({ ok: z.literal(true) }), "DELETE", { version }),
    onSuccess: () => client.invalidateQueries({ predicate: q => matchesLiveTopics(q.queryKey, new Set(["discounts", "flights"])) }),
    onError: error => { if (error instanceof CampaignApiError && error.status === 409) void client.invalidateQueries({ queryKey: discountQueryKey }); },
  });
}
