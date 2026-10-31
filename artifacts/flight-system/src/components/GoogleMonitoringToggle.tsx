import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
export function GoogleMonitoringBadge() {
  return <span title="Kontrollet Google janë çaktivizuar" aria-label="Kontrollet Google janë çaktivizuar"
    className="ml-1.5 inline-flex items-center rounded-md border border-slate-400 bg-slate-100 px-1 py-0.5 text-black shadow-sm">
    <X aria-hidden="true" className="h-3.5 w-3.5 stroke-[3]" />
  </span>;
}

export function GoogleMonitoringToggle({ flightId, disabled, onUpdated }: {
  flightId: number; disabled: boolean; onUpdated?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const title = disabled ? "Aktivizo përsëri kontrollet Google" : "Mos kontrollo nga Google";
  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/flights/${flightId}/google-monitoring`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !disabled }),
      });
      const result = await response.json().catch(() => {
        throw new Error("Serveri nuk ktheu përgjigjen e pritur. Rifresko faqen dhe provo përsëri.");
      });
      if (!response.ok) throw new Error(result.error || "Ndryshimi nuk u ruajt");
      if (typeof result.googleMonitoringDisabled !== "boolean") {
        throw new Error("Serveri nuk konfirmoi ruajtjen e ndryshimit.");
      }
      await queryClient.invalidateQueries();
      onUpdated?.();
      toast({ title: result.googleMonitoringDisabled ? "Kontrollet Google u çaktivizuan" : "Kontrollet Google u aktivizuan" });
    } catch (error) {
      toast({ title: "Ndryshimi nuk u ruajt", description: error instanceof Error ? error.message : "Gabim rrjeti", variant: "destructive" });
    } finally { setSaving(false); }
  };
  return <button type="button" aria-label={title} aria-pressed={disabled} title={title}
    disabled={saving} onClick={toggle} data-testid="toggle-google-monitoring"
    className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-black disabled:opacity-50 ${disabled ? "border-black bg-slate-200" : "border-slate-300 bg-white hover:bg-slate-100"}`}>
    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 stroke-[3]" />}
  </button>;
}
