const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export interface BrandingSummary {
  siteName: string;
  tagline: string;
  primaryColor: string;
  logoUrl: string | null;
  backgroundUrl: string | null;
}

export async function loadBranding(): Promise<BrandingSummary> {
  const response = await fetch(`${API_BASE}/branding?compact=1`);
  if (!response.ok) throw new Error("Branding could not be loaded");
  return response.json();
}