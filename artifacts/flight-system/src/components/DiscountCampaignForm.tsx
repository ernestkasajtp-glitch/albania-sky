import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Form } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSaveDiscountCampaign, CampaignApiError } from "@/hooks/use-discount-campaigns";
import { editableCampaignSchema, editableFields, tiranaNow, type Campaign, type CampaignFields, type CampaignList } from "@/lib/discountCampaigns";
import { FLIGHT_DISCOUNT_CHANNELS, FLIGHT_DISCOUNT_CHANNEL_LABELS } from "@/lib/flightDiscount";

export function DiscountCampaignForm({ campaign, data, onClose }: { campaign: Campaign | null; data: CampaignList; onClose: () => void }) {
  const now = tiranaNow();
  const form = useForm<CampaignFields>({ defaultValues: campaign ? editableFields(campaign) : {
    name: "", enabled: true, type: "percent", value: 10, channels: [...FLIGHT_DISCOUNT_CHANNELS],
    startsAt: now, endsAt: `${now.slice(0, 10)}T23:59`, periods: [{ from: now.slice(0, 10), to: now.slice(0, 10) }],
    scope: "all", fromAirport: null, toAirport: null, groupId: null, flightIds: [], priority: 0,
  } });
  const { register, watch, setValue, control } = form;
  const intervals = useFieldArray({ control, name: "periods" });
  const save = useSaveDiscountCampaign();
  const [error, setError] = useState("");
  const [creationToken] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState("");
  const scope = watch("scope"), type = watch("type"), channels = watch("channels"), flightIds = watch("flightIds");
  const visibleFlights = data.flights.filter(f => `${f.flightNumber ?? ""} ${f.fromAirport} ${f.toAirport} ${f.departureDate} ${f.id}`.toLowerCase().includes(search.toLowerCase()));
  const missingFlights = flightIds.filter(id => !data.flights.some(f => f.id === id));
  const submit = form.handleSubmit(async raw => {
    setError("");
    const parsed = editableCampaignSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues.map(i => i.message).join(" · "));
      return;
    }
    try {
      await save.mutateAsync({ fields: parsed.data, id: campaign?.id, version: campaign?.version, creationToken });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Ruajtja dështoi"); }
  });
  const conflict = save.error instanceof CampaignApiError && save.error.status === 409;
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="discount-page max-w-2xl max-h-[90dvh] overflow-y-auto bg-card" onEscapeKeyDown={e => { if (save.isPending) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>{campaign ? "Ndrysho fushatën" : "Fushatë e re Discount"}</DialogTitle>
        <DialogDescription>Zbritje automatike vetëm për shitjet e reja. Rezervimet ekzistuese nuk ndryshojnë.</DialogDescription>
      </DialogHeader>
      <Form {...form}><form onSubmit={submit} className="space-y-5" aria-describedby={error ? "discount-form-error" : undefined} data-testid="form-discount">
        {!campaign && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">Kur ruhet një ofertë e aktivizuar që përfshin Agjentët, email-i i saj dërgohet automatikisht te agjentët aktivë me njoftime email të lejuara. Ndryshimi i ofertës më vonë nuk e ridërgon email-in.</p>}
        <fieldset disabled={save.isPending} className="space-y-5 min-w-0">
          <div className="discount-field"><label htmlFor="discount-name">Emri i fushatës</label><input id="discount-name" autoFocus required maxLength={200} {...register("name")} className="discount-input" data-testid="input-discount-name" /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="discount-field"><label htmlFor="discount-type">Lloji i zbritjes</label><select id="discount-type" {...register("type")} className="discount-input" data-testid="select-discount-type"><option value="percent">Përqindje (%)</option><option value="fixed">Vlerë fikse (€)</option></select></div>
            <div className="discount-field"><label htmlFor="discount-value">Vlera ({type === "percent" ? "%" : "€"})</label><input id="discount-value" type="number" required min="0.01" step="any" max={type === "percent" ? 100 : undefined} {...register("value", { valueAsNumber: true })} className="discount-input" data-testid="input-discount-value" /></div>
            <div className="discount-field"><label htmlFor="discount-priority">Prioritet</label><input id="discount-priority" type="number" required step="1" {...register("priority", { valueAsNumber: true })} className="discount-input" data-testid="input-discount-priority" /></div>
          </div>
          <fieldset className="rounded-lg border p-3"><legend className="px-1">Kanalet e shitjes</legend><div className="flex flex-wrap gap-x-5 gap-y-3">{FLIGHT_DISCOUNT_CHANNELS.map(c => <label key={c} className="inline-flex items-center gap-2"><input type="checkbox" checked={channels.includes(c)} onChange={e => setValue("channels", e.target.checked ? [...channels, c] : channels.filter(x => x !== c))} data-testid={`checkbox-campaign-channel-${c}`} />{FLIGHT_DISCOUNT_CHANNEL_LABELS[c]}</label>)}</div></fieldset>
          <fieldset className="space-y-3"><legend>Afati i shitjes · Ora e Tiranës</legend><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="discount-field"><label htmlFor="discount-start">Fillimi · Ora e Tiranës</label><input id="discount-start" type="datetime-local" required {...register("startsAt")} className="discount-input" data-testid="input-discount-start" /></div>
            <div className="discount-field"><label htmlFor="discount-end">Mbarimi · Ora e Tiranës</label><input id="discount-end" type="datetime-local" required {...register("endsAt")} className="discount-input" data-testid="input-discount-end" /></div>
          </div></fieldset>
          <fieldset className="space-y-3"><legend>Periudhat e udhëtimit</legend><p className="text-xs text-muted-foreground">Të dyja datat përfshihen. Mund të shtosh disa intervale.</p>
            {intervals.fields.map((p, i) => <div key={p.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="discount-field col-span-2 md:col-span-1"><label htmlFor={`period-from-${p.id}`}>Nga · periudha {i + 1}</label><input id={`period-from-${p.id}`} type="date" required {...register(`periods.${i}.from`)} className="discount-input" data-testid={`input-period-from-${i}`} /></div>
              <div className="discount-field"><label htmlFor={`period-to-${p.id}`}>Deri · periudha {i + 1}</label><input id={`period-to-${p.id}`} type="date" required {...register(`periods.${i}.to`)} className="discount-input" data-testid={`input-period-to-${i}`} /></div>
              <button type="button" disabled={intervals.fields.length === 1} onClick={() => intervals.remove(i)} className="discount-button text-rose-700" aria-label={`Hiq periudhën ${i + 1}`} data-testid={`button-remove-period-${i}`}><Trash2 size={14} /></button>
            </div>)}
            <button type="button" onClick={() => intervals.append({ from: "", to: "" })} className="discount-button" data-testid="button-add-period"><Plus size={14} />Shto periudhë</button>
          </fieldset>
          <div className="discount-field"><label htmlFor="discount-scope">Ku aplikohet</label><select id="discount-scope" {...register("scope")} className="discount-input" data-testid="select-discount-scope"><option value="all">Të gjitha fluturimet</option><option value="route">Linjë ajrore</option><option value="group">Grup fluturimesh</option><option value="flights">Fluturime të zgjedhura</option></select></div>
          {scope === "route" && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="discount-field"><label htmlFor="discount-from">Nga · kodi IATA</label><input id="discount-from" required maxLength={3} value={watch("fromAirport") ?? ""} onChange={e => setValue("fromAirport", e.target.value.toUpperCase().trim())} className="discount-input uppercase" placeholder="TIA" data-testid="input-discount-from" /></div>
            <div className="discount-field"><label htmlFor="discount-to">Në · kodi IATA</label><input id="discount-to" required maxLength={3} value={watch("toAirport") ?? ""} onChange={e => setValue("toAirport", e.target.value.toUpperCase().trim())} className="discount-input uppercase" placeholder="DUS" data-testid="input-discount-to" /></div>
          </div>}
          {scope === "group" && <div className="discount-field"><label htmlFor="discount-group">Grupi</label><select id="discount-group" required value={watch("groupId") ?? ""} onChange={e => setValue("groupId", e.target.value ? Number(e.target.value) : null)} className="discount-input" data-testid="select-discount-group"><option value="">Zgjidh grupin</option>{campaign?.groupId && !data.groups.some(g => g.id === campaign.groupId) && <option value={campaign.groupId}>Grupi #{campaign.groupId} (jo në listë)</option>}{data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
          {scope === "flights" && <fieldset className="space-y-2"><legend>Fluturimet · {flightIds.length} të zgjedhura</legend><label htmlFor="discount-flight-search" className="sr-only">Kërko fluturime</label><input id="discount-flight-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Kërko kodin, linjën ose datën…" className="discount-input" data-testid="input-discount-flight-search" />
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">{visibleFlights.map(f => <label key={f.id} className="flex gap-2 p-2.5 cursor-pointer"><input type="checkbox" checked={flightIds.includes(f.id)} onChange={e => setValue("flightIds", e.target.checked ? [...flightIds, f.id] : flightIds.filter(id => id !== f.id))} data-testid={`checkbox-discount-flight-${f.id}`} /><span>{f.fromAirport} → {f.toAirport} · {f.flightNumber || `#${f.id}`} · {f.departureDate.slice(0, 10)}</span></label>)}{!visibleFlights.length && <p className="p-3 text-xs text-muted-foreground">Nuk ka fluturime për këtë kërkim.</p>}
              {missingFlights.map(id => <label key={id} className="flex gap-2 p-2.5"><input type="checkbox" checked onChange={() => setValue("flightIds", flightIds.filter(v => v !== id))} data-testid={`checkbox-discount-flight-${id}`} />Fluturimi #{id} (jo në listë)</label>)}
            </div>
          </fieldset>}
          <label className="inline-flex items-center gap-2"><input type="checkbox" {...register("enabled")} data-testid="checkbox-discount-enabled" />Fushata e aktivizuar</label>
          <p className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 leading-relaxed">Prioriteti më i lartë fiton. Në barazim fiton fushata e krijuar më vonë. Zbritja manuale fiton gjithmonë; zbritjet nuk mblidhen. Aplikohet pas markup-it, për biletat përfshirë foshnjat, jo për ekstra/taksa.</p>
        </fieldset>
        {error && <div id="discount-form-error" role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="error-discount-form">{error}{conflict && <p className="mt-2 font-semibold">Fushata është ndryshuar nga dikush tjetër. Mbyll formularin dhe hape përsëri për versionin e fundit; ndryshimet e tua nuk janë ruajtur.</p>}</div>}
        <div className="flex justify-end gap-2 border-t pt-4"><button type="button" disabled={save.isPending} onClick={onClose} className="discount-button" data-testid="button-cancel-discount">Anulo</button><button type="submit" disabled={save.isPending || conflict} className="discount-button discount-primary" data-testid="button-save-discount">{save.isPending ? "Duke ruajtur…" : "Ruaj fushatën"}</button></div>
      </form></Form>
    </DialogContent>
  </Dialog>;
}
