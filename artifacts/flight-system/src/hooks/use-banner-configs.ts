import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { campaignSchema } from "@/lib/discountCampaigns";
import { colorKeys, type Colors } from "../banner/OfferBanner";

const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
export const colorsSchema = z.object(Object.fromEntries(colorKeys.map(key => [key, z.string().regex(/^#[0-9a-fA-F]{6}$/)])) as Record<typeof colorKeys[number], z.ZodString>);
const bannerSchema = z.object({ enabled: z.boolean(), version: z.number().int().nonnegative(), colors: colorsSchema });
const listSchema = z.object({ serverNow: z.number().finite(), campaigns: z.array(campaignSchema.extend({ startsAtMs: z.number().finite(), endsAtMs: z.number().finite(), banner: bannerSchema })) });
export type BannerCampaign = z.infer<typeof listSchema>["campaigns"][number];
export type BannerList = z.infer<typeof listSchema> & { receivedAt: number };
export class BannerApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(path: string, method: string, signal?: AbortSignal, body?: unknown) {
  const response = await fetch(`${apiBase}/banner-configs${path}`, { method, credentials: "include", cache: "no-store", signal, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new BannerApiError(typeof json?.error === "string" ? json.error : `Kërkesa dështoi (${response.status})`, response.status);
  return json;
}
export function useBannerConfigs(enabled = true) {
  return useQuery({ queryKey: ["banner-configs"], enabled, queryFn: async ({ signal }): Promise<BannerList> => {
    const json = await request("", "GET", signal);
    const receivedAt = Date.now();
    const parsed = listSchema.safeParse(json);
    if (!parsed.success) throw new Error("Përgjigje e pavlefshme nga serveri.");
    return { ...parsed.data, receivedAt };
  }, staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 });
}
export function useSaveBanner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; version: number; enabled: boolean; colors: Colors }) => {
      const json = await request(`/${encodeURIComponent(id)}`, "PUT", undefined, body);
      const parsed = z.object({ banner: bannerSchema }).safeParse(json);
      if (!parsed.success || parsed.data.banner.version <= body.version) throw new Error("Serveri nuk konfirmoi versionin e ri. Rifresko para se të riprovosh.");
      return { id, banner: parsed.data.banner };
    },
    onSuccess: ({ id, banner }) => {
      client.setQueryData<BannerList>(["banner-configs"], old => old ? { ...old, campaigns: old.campaigns.map(c => c.id === id ? { ...c, banner } : c) } : old);
    },
    onError: error => { if (error instanceof BannerApiError && error.status === 409) void client.invalidateQueries({ queryKey: ["banner-configs"] }); },
  });
}
