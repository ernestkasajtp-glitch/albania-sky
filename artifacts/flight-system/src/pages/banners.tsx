import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Save, RotateCcw } from "lucide-react";
import { BannerApiError, useBannerConfigs, useSaveBanner } from "@/hooks/use-banner-configs";
import { BannerColorPicker } from "@/components/BannerColorPicker";
import { OfferBanner, colorKeys, defaultColors, useOfferNow, type ColorKey, type Colors } from "../banner/OfferBanner";
import "./banners.css";

const labels: Record<ColorKey, string> = { background: "Sfondi", border: "Korniza", title: "Titulli", discount: "Zbritja", description: "Përshkrimi", periods: "Periudhat", countdownTitle: "Titulli i numërimit", countdownNumbers: "Numrat", countdownLabels: "Etiketat e kohës", countdownBackground: "Sfondi i numrave", countdownBorder: "Korniza e numrave", expiry: "Afati" };
type Draft = { enabled: boolean; version: number; colors: Colors };
export default function BannersPage({ initialCampaignId = "", onDirtyChange }: { initialCampaignId?: string; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const query = useBannerConfigs();
  const save = useSaveBanner();
  const [selected, setSelected] = useState(initialCampaignId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [field, setField] = useState<ColorKey>("background");
  const [notice, setNotice] = useState("");
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const campaign = query.data?.campaigns.find(c => c.id === selected);
  const now = useOfferNow(query.data);
  useEffect(() => {
    if (!query.data) return;
    if (!selected && query.data.campaigns.length) { setSelected(query.data.campaigns[0].id); return; }
    const current = query.data.campaigns.find(c => c.id === selected);
    if (current && !dirtyRef.current) { setDraft(structuredClone(current.banner)); setBaseline(JSON.stringify(current.banner)); }
  }, [query.data, selected]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest("a");
      if (a && !a.hasAttribute("download") && a.href !== window.location.href && !window.confirm("Ka ndryshime të paruajtura. Të largohesh pa i ruajtur?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  const reset = () => {
    if (!campaign || (dirty && !window.confirm("Të heqësh ndryshimet e paruajtura dhe të ngarkosh versionin e fundit?"))) return;
    setDraft(structuredClone(campaign.banner)); setBaseline(JSON.stringify(campaign.banner)); save.reset(); setNotice("");
  };
  const conflict = save.error instanceof BannerApiError && save.error.status === 409;
  const changedRemotely = !!campaign && !!draft && campaign.banner.version !== draft.version;
  return <div className="banner-editor" data-testid="page-banners">
    <header className="be-header"><div><div className="be-eyebrow">Komunikimi i ofertave</div><h1>Banner</h1><p className="be-muted">Ngjyrat e ofertës, me të dhënat e fushatës. Asgjë nuk publikohet pa ruajtur.</p></div><Link href="/discounts" className="be-button" data-testid="link-banner-discounts">Menaxho Discount</Link></header>
    {query.isLoading ? <div className="be-loading" role="status" aria-label="Duke ngarkuar bannerat" /> : query.isError ? <div className="be-notice" role="alert">{query.error.message} <button className="be-button" onClick={() => void query.refetch()} data-testid="button-banner-retry">Provo përsëri</button></div> : !query.data?.campaigns.length ? <section className="be-panel"><h2>Nuk ka fushata për t’u shfaqur</h2><p className="be-muted">Krijo fillimisht një fushatë Discount. Banneri merr automatikisht vlerën, periudhat dhe afatin e saj.</p><Link href="/discounts" className="be-button" data-testid="link-banner-create-campaign">Hap Discount</Link></section> : <>
      <div className="be-layout"><section className="be-panel">
        <label htmlFor="banner-campaign" className="be-label">Fushata Discount</label><select id="banner-campaign" data-testid="select-banner-campaign" value={selected} disabled={save.isPending} onChange={e => {
          if (dirty && !window.confirm("Ka ndryshime të paruajtura. Të kalosh te një fushatë tjetër pa i ruajtur?")) return;
          dirtyRef.current = false; setDraft(null); setBaseline(""); setSelected(e.target.value); save.reset(); setNotice("");
        }}>{query.data.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {draft && campaign ? <>
          <label className="be-label" style={{ marginTop: 20, display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" checked={draft.enabled} disabled={save.isPending} data-testid="checkbox-banner-enabled" onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />Shfaq bannerin kur fushata është aktive</label>
          <p className="be-muted">Aktivizimi respekton audiencën, disponueshmërinë dhe zbritjen fituese.</p>
          <div className="be-fields">{colorKeys.map(key => <button key={key} className="be-swatch" data-testid={`button-color-${key}`} aria-pressed={field === key} onClick={() => setField(key)}><i className="be-dot" style={{ background: draft.colors[key] }} />{labels[key]}</button>)}</div>
          <BannerColorPicker key={field} label={labels[field]} value={draft.colors[field]} onChange={color => setDraft(old => old ? { ...old, colors: { ...old.colors, [field]: color } } : old)} />
          <button className="be-button" style={{ marginTop: 15 }} disabled={save.isPending} data-testid="button-banner-default-colors" onClick={() => setDraft({ ...draft, colors: { ...defaultColors } })}>Ngjyrat fillestare</button>
        </> : <p className="be-notice" role="alert">Fushata nuk është më e disponueshme. Zgjidh një fushatë tjetër.</p>}
      </section><aside className="be-panel be-preview">
        <div className="be-eyebrow">Pamje paraprake · jo e publikuar</div>
        {campaign && draft && <><div className="be-stage"><OfferBanner offer={{ ...campaign, colors: draft.colors }} now={now} /></div>
          <h2 style={{ fontWeight: 700, fontSize: 14 }}>{campaign.name}</h2>
          <dl className="be-readonly"><dt>Zbritja</dt><dd>{campaign.value}{campaign.type === "percent" ? "%" : " €"}</dd><dt>Fillimi</dt><dd>{campaign.startsAt.replace("T", " · ")} · Ora e Tiranës</dd><dt>Mbarimi</dt><dd>{campaign.endsAt.replace("T", " · ")} · Ora e Tiranës</dd><dt>Nisjet</dt><dd>{campaign.periods.map((p, i) => <div key={i}>{p.from} → {p.to}</div>)}</dd><dt>Versioni</dt><dd>{draft.version} · {draft.enabled ? "I aktivizuar" : "I çaktivizuar"}</dd></dl>
          <p className="be-muted" style={{ marginTop: 18 }}>Vlerat dhe datat janë vetëm për lexim. Për t’i ndryshuar, përdor Discount.</p></>}
        {(changedRemotely || conflict) && <div role="alert" className="be-notice" data-testid="error-banner-conflict">Versioni në server ka ndryshuar. Ndryshimet e tua janë ruajtur në këtë faqe, jo publikuar. Përdor “Rivendos” për të ngarkuar versionin e fundit përpara ruajtjes.</div>}
        {save.isError && !conflict && <div className="be-notice" role="alert">{save.error.message}</div>}
        {notice && <p className="be-notice" role="status">{notice}</p>}
        <div className="be-actions"><button className="be-button" data-testid="button-banner-reset" disabled={!draft || save.isPending} onClick={reset}><RotateCcw size={14} />Rivendos</button><button className="be-button be-primary" data-testid="button-banner-save" disabled={!dirty || !campaign || save.isPending || conflict || changedRemotely} onClick={async () => {
          if (!draft || !campaign) return;
          setNotice("");
          const submitted = JSON.stringify(draft);
          try { const result = await save.mutateAsync({ id: campaign.id, ...draft }); setDraft(current => current && JSON.stringify(current) !== submitted ? { ...current, version: result.banner.version } : structuredClone(result.banner)); setBaseline(JSON.stringify(result.banner)); setNotice("Banneri u ruajt. Vetëm versioni i ruajtur shfaqet publikisht."); } catch { /* Keep draft intact. */ }
        }}><Save size={14} />{save.isPending ? "Duke ruajtur…" : "Ruaj ndryshimet"}</button></div>
        <p className="be-muted" role="status" style={{ textAlign: "right", marginTop: 9 }}>{dirty ? "Ndryshime të paruajtura" : "Pa ndryshime të paruajtura"}</p>
      </aside></div>
    </>}
  </div>;
}
