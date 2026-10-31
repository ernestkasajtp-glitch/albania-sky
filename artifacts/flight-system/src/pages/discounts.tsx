import { useEffect, useState } from "react";
import { Pencil, Percent, Plus, Power, RefreshCw, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DiscountCampaignForm } from "@/components/DiscountCampaignForm";
import { CampaignApiError, useDeleteDiscountCampaign, useDiscountCampaigns, useSaveDiscountCampaign } from "@/hooks/use-discount-campaigns";
import { campaignStatus, editableFields, tiranaNow, type Campaign } from "@/lib/discountCampaigns";
import { flightDiscountLabel, flightDiscountChannelsLabel } from "@/lib/flightDiscount";
import "./discounts.css";
import BannersPage from "./banners";

const statuses = {
  disabled: { label: "E çaktivizuar", style: "bg-muted text-muted-foreground" },
  planned: { label: "E planifikuar", style: "bg-blue-50 text-blue-700 border-blue-200" },
  active: { label: "Aktive", style: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  expired: { label: "E skaduar", style: "bg-amber-50 text-amber-800 border-amber-200" },
};
const displayDate = (v: string) => v.replace("T", " · ");
export default function DiscountsPage() {
  const query = useDiscountCampaigns();
  const toggle = useSaveDiscountCampaign();
  const remove = useDeleteDiscountCampaign();
  const [editor, setEditor] = useState<Campaign | "new" | null>(null);
  const [bannerCampaign, setBannerCampaign] = useState<Campaign | null>(null);
  const [bannerDirty, setBannerDirty] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(tiranaNow);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => setNow(tiranaNow());
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const campaigns = query.data?.campaigns ?? [];
  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || campaignStatus(c, now) === filter))
    .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
  const scopeLabel = (c: Campaign) => c.scope === "all" ? "Të gjitha fluturimet" : c.scope === "route" ? `${c.fromAirport} → ${c.toAirport}` : c.scope === "group" ? query.data?.groups.find(g => g.id === c.groupId)?.name ?? `Grupi #${c.groupId}` : `${c.flightIds.length} fluturime`;
  const toggleCampaign = async (c: Campaign) => {
    setNotice("");
    try {
      await toggle.mutateAsync({ id: c.id, version: c.version, fields: { ...editableFields(c), enabled: !c.enabled } });
      setNotice(c.enabled ? "Fushata u çaktivizua." : "Fushata u aktivizua.");
    } catch { /* Mutation error is shown below. */ }
  };
  return <div className="discount-page space-y-5" data-testid="page-discounts">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-emerald-700"><Percent size={22} /></span><div><h1 className="text-2xl font-bold tracking-tight">Discount</h1><p className="mt-1 text-xs text-muted-foreground">Fushatat automatike të zbritjes · Ora e Tiranës</p></div></div>
      <button type="button" onClick={() => { toggle.reset(); setEditor("new"); }} disabled={!query.data || query.isError} className="discount-button discount-primary" data-testid="button-create-discount"><Plus size={15} />Fushatë e re</button>
    </header>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 leading-relaxed">
      <strong>Një zbritje për biletë.</strong> Prioriteti më i lartë fiton; në barazim fiton fushata më e re. Zbritja manuale ka gjithmonë përparësi. Pas markup-it, për të gjitha biletat përfshirë foshnjat, jo për ekstra/taksa. Rezervimet ekzistuese mbeten të pandryshuara.
    </div>
    {notice && <p role="status" className="text-xs text-emerald-700" data-testid="status-discount-success">{notice}</p>}
    {toggle.isError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="error-discount-toggle">{toggle.error.message}{toggle.error instanceof CampaignApiError && toggle.error.status === 409 && " Lista po rifreskohet. Kontrollo versionin e fundit para se të riprovosh."}</div>}
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b">
        <div className="relative flex-1 min-w-40"><Search size={14} className="absolute left-2.5 top-3 text-muted-foreground" /><label htmlFor="campaign-search" className="sr-only">Kërko fushatë</label><input id="campaign-search" type="search" value={search} onChange={e => setSearch(e.target.value)} className="discount-input !pl-8" placeholder="Kërko fushatë…" data-testid="input-campaign-search" /></div>
        <label htmlFor="campaign-status" className="sr-only">Filtro sipas statusit</label><select id="campaign-status" value={filter} onChange={e => setFilter(e.target.value)} className="discount-input !w-auto" data-testid="select-campaign-status"><option value="all">Të gjitha statuset</option>{Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="discount-button" data-testid="button-refresh-discounts" aria-label="Rifresko fushatat"><RefreshCw size={14} /><span className="hidden md:inline">Rifresko</span></button>
        <span className="text-xs text-muted-foreground" data-testid="text-campaign-count">{filtered.length} fushata</span>
      </div>
      {query.isLoading ? <div className="p-4 space-y-3" role="status" aria-label="Duke ngarkuar fushatat" data-testid="loading-discounts">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
      : query.isError ? <div className="p-10 text-center space-y-3" role="alert" data-testid="error-discounts"><p className="font-semibold">Fushatat nuk u ngarkuan</p><p className="text-xs text-muted-foreground">{query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="discount-button" data-testid="button-retry-discounts">Provo përsëri</button></div>
      : !filtered.length ? <div className="py-14 px-5 text-center" data-testid="empty-discounts"><Percent size={30} className="mx-auto text-emerald-600 mb-3" /><h2 className="font-semibold">{campaigns.length ? "Asnjë fushatë për këtë filtër" : "Ende nuk ka fushata"}</h2><p className="text-xs text-muted-foreground mt-2 mb-4">{campaigns.length ? "Provo një emër ose status tjetër." : "Krijo një zbritje dhe përcakto afatin, kanalet dhe fluturimet."}</p><button type="button" className="discount-button" onClick={() => campaigns.length ? (setSearch(""), setFilter("all")) : setEditor("new")} data-testid="button-empty-discounts">{campaigns.length ? "Pastro filtrat" : "Krijo fushatën e parë"}</button></div>
      : <div className="overflow-x-auto"><table className="w-full text-xs min-w-[850px]" data-testid="table-discounts"><caption className="sr-only">Fushatat e zbritjeve, të renditura sipas prioritetit dhe datës së krijimit</caption><thead className="bg-muted/40 border-b"><tr><th scope="col">Fushata / Statusi</th><th scope="col">Zbritja / Kanalet</th><th scope="col">Afati i shitjes</th><th scope="col">Udhëtimi / Shtrirja</th><th scope="col">Prioritet</th><th scope="col">Veprime</th></tr></thead><tbody className="divide-y">{filtered.map(c => {
        const status = statuses[campaignStatus(c, now)];
        return <tr key={c.id} className="hover:bg-muted/30" data-testid={`row-campaign-${c.id}`}>
          <td><p className="font-semibold max-w-52 break-words mb-2">{c.name}</p><span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${status.style}`} data-testid={`status-campaign-${c.id}`}>{status.label}</span>
            {c.emailDelivery && <div className="mt-2 text-[10px] text-muted-foreground space-y-1" data-testid={`email-campaign-${c.id}`}>
              <p>Email: {c.emailDelivery.sent}/{c.emailDelivery.total} dërguar{c.emailDelivery.pending > 0 ? ` · ${c.emailDelivery.pending} në pritje` : ""}</p>
              {c.emailDelivery.failed > 0 && <p className="text-red-600">{c.emailDelivery.failed} pa konfirmim dërgimi · kontrollo Njoftimet e sistemit</p>}
              {c.emailDelivery.cancelled > 0 && <p>{c.emailDelivery.cancelled} të ndaluara</p>}
              {c.emailDelivery.reason && <p>{c.emailDelivery.reason}</p>}
            </div>}
          </td>
          <td><p className="text-base font-bold text-emerald-700 tabular-nums">{flightDiscountLabel(c)}</p><p className="max-w-44 text-[10px] text-muted-foreground mt-1">{flightDiscountChannelsLabel(c.channels)}</p><button type="button" className="discount-button mt-2" data-testid={`button-discount-banner-${c.id}`} onClick={() => { setBannerDirty(false); setBannerCampaign(c); }}>Banner · Edito pamjen</button></td>
          <td className="whitespace-nowrap tabular-nums"><p>{displayDate(c.startsAt)}</p><p className="text-muted-foreground mt-1">{displayDate(c.endsAt)}</p><p className="text-[10px] text-muted-foreground mt-1">Ora e Tiranës</p></td>
          <td><p className="font-medium mb-1">{scopeLabel(c)}</p>{c.periods.map((p, i) => <p key={i} className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{p.from} → {p.to}</p>)}</td>
          <td><span className="font-mono font-semibold rounded bg-muted px-2 py-1">{c.priority}</span></td>
          <td><div className="flex gap-1"><button type="button" onClick={() => { toggle.reset(); setEditor(c); }} disabled={toggle.isPending} className="discount-button !p-2" aria-label={`Ndrysho ${c.name}`} title="Ndrysho" data-testid={`button-edit-campaign-${c.id}`}><Pencil size={14} /></button><button type="button" onClick={() => void toggleCampaign(c)} disabled={toggle.isPending} className="discount-button !p-2 text-emerald-700" aria-label={`${c.enabled ? "Çaktivizo" : "Aktivizo"} ${c.name}`} title={c.enabled ? "Çaktivizo" : "Aktivizo"} data-testid={`button-toggle-campaign-${c.id}`}><Power size={14} /></button><button type="button" onClick={() => { remove.reset(); setDeleting(c); }} disabled={toggle.isPending} className="discount-button !p-2 text-rose-700" aria-label={`Fshi ${c.name}`} title="Fshi" data-testid={`button-delete-campaign-${c.id}`}><Trash2 size={14} /></button></div></td>
        </tr>;
      })}</tbody></table></div>}
    </section>
    {editor && query.data && <DiscountCampaignForm campaign={editor === "new" ? null : editor} data={query.data} onClose={() => setEditor(null)} />}
    <Dialog open={!!bannerCampaign} onOpenChange={open => {
      if (!open && (!bannerDirty || window.confirm("Ka ndryshime të paruajtura. Ta mbyllësh pa i ruajtur?"))) setBannerCampaign(null);
    }}>
      <DialogContent className="!max-w-[1200px] w-[96vw] max-h-[92vh] overflow-y-auto bg-card">
        <DialogHeader><DialogTitle>Banner · {bannerCampaign?.name}</DialogTitle><DialogDescription>Edito ngjyrat dhe shiko banerin live, pa dalë nga Discount.</DialogDescription></DialogHeader>
        {bannerCampaign && <BannersPage key={bannerCampaign.id} initialCampaignId={bannerCampaign.id} onDirtyChange={setBannerDirty} />}
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}><DialogContent className="discount-page bg-card" onPointerDownOutside={e => { if (remove.isPending) e.preventDefault(); }} onEscapeKeyDown={e => { if (remove.isPending) e.preventDefault(); }}><DialogHeader><DialogTitle>Fshi fushatën?</DialogTitle><DialogDescription>Fushata “{deleting?.name}” do të fshihet. Ky veprim nuk kthehet pas dhe nuk ndryshon rezervimet ekzistuese.</DialogDescription></DialogHeader>
      {remove.isError && <p role="alert" className="text-xs text-rose-700" data-testid="error-delete-discount">{remove.error.message}{remove.error instanceof CampaignApiError && remove.error.status === 409 && " Mbyll dhe provo përsëri me versionin e fundit."}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setDeleting(null)} disabled={remove.isPending} className="discount-button" data-testid="button-cancel-delete-discount">Anulo</button><button type="button" disabled={remove.isPending || (remove.error instanceof CampaignApiError && remove.error.status === 409)} className="discount-button bg-rose-700 text-white" data-testid="button-confirm-delete-discount" onClick={async () => { if (!deleting) return; try { await remove.mutateAsync({ id: deleting.id, version: deleting.version }); setDeleting(null); setNotice("Fushata u fshi."); } catch { /* Show mutation error without closing. */ } }}>{remove.isPending ? "Duke fshirë…" : "Fshi fushatën"}</button></div>
    </DialogContent></Dialog>
  </div>;
}
