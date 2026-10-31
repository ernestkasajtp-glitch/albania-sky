import { useState, useEffect, useRef } from "react";
import { fmtM } from "@/lib/utils";
import { Plus, Trash2, Edit2, Loader2, CheckCircle2, AlertCircle, Image, ArrowUp, ArrowDown, ToggleLeft, ToggleRight, X, Eye, EyeOff, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { confirmDangerDialog } from "@/lib/confirm";

const API = "/api";

interface Destination {
  id: number;
  itinerary: string;
  displayName: string;
  priceMode: "auto" | "manual";
  manualDate: string | null;
  photoUrl: string | null;
  photoCardUrl?: string | null;
  sortOrder: number;
  active: boolean;
  resolvedDate: string | null;
  resolvedPrice: number | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

function PhotoPreview({ url, cardUrl }: { url: string | null; cardUrl?: string | null }) {
  if (!url) return (
    <div className="w-20 h-14 bg-muted rounded-lg flex items-center justify-center shrink-0">
      <Image className="h-6 w-6 text-muted-foreground/40" />
    </div>
  );
  const src = url.startsWith("/uploads") ? `${API.replace("/api", "")}${url}` : url;
  const cardSrc = cardUrl
    ? (cardUrl.startsWith("/uploads") ? `${API.replace("/api", "")}${cardUrl}` : cardUrl)
    : src;
  return (
    <img
      src={cardSrc}
      alt=""
      loading="lazy"
      decoding="async"
      onError={(event) => {
        if (event.currentTarget.dataset.fallback !== "true") {
          event.currentTarget.dataset.fallback = "true";
          event.currentTarget.src = src;
        }
      }}
      className="w-20 h-14 object-cover rounded-lg shrink-0"
    />
  );
}

interface FormState {
  itinerary: string;
  displayName: string;
  priceMode: "auto" | "manual";
  manualDate: string;
  sortOrder: string;
  active: boolean;
  photo: File | null;
  photoCard: File | null;
  photoPreview: string | null;
}

const emptyForm = (): FormState => ({
  itinerary: "",
  displayName: "",
  priceMode: "auto",
  manualDate: "",
  sortOrder: "0",
  active: true,
  photo: null,
  photoCard: null,
  photoPreview: null,
});

async function createDestinationCard(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    const targetWidth = 720;
    const targetHeight = 504;
    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const sourceWidth = sourceRatio > targetRatio
      ? image.naturalHeight * targetRatio
      : image.naturalWidth;
    const sourceHeight = sourceRatio > targetRatio
      ? image.naturalHeight
      : image.naturalWidth / targetRatio;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
    return blob ? new File([blob], "destination-card.webp", { type: "image/webp" }) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function DestinacionePage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Search filter
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/destinations`, { credentials: "include" });
      setDestinations(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (d: Destination) => {
    setEditingId(d.id);
    setForm({
      itinerary: d.itinerary,
      displayName: d.displayName,
      priceMode: d.priceMode,
      manualDate: d.manualDate || "",
      sortOrder: String(d.sortOrder),
      active: d.active,
      photo: null,
      photoCard: null,
      photoPreview: d.photoUrl
        ? `${API.replace("/api", "")}${d.photoUrl}`
        : null,
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const photoCard = await createDestinationCard(file);
    setForm(f => ({ ...f, photo: file, photoCard, photoPreview: URL.createObjectURL(file) }));
  };

  const handleSave = async () => {
    if (!form.itinerary || !form.displayName) {
      toast({ title: "Plotëso itinerarin dhe emrin", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("itinerary", form.itinerary.toUpperCase());
      fd.append("displayName", form.displayName);
      fd.append("priceMode", form.priceMode);
      if (form.priceMode === "manual") fd.append("manualDate", form.manualDate);
      fd.append("sortOrder", form.sortOrder);
      fd.append("active", String(form.active));
      if (form.photo) fd.append("photo", form.photo);
      if (form.photoCard) fd.append("photoCard", form.photoCard);

      const url = editingId
        ? `${API}/admin/destinations/${editingId}`
        : `${API}/admin/destinations`;
      const method = editingId ? "PATCH" : "POST";

      const r = await fetch(url, { method, body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: editingId ? "Destinacion u përditësua" : "Destinacion u shtua" });
      closeForm();
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDangerDialog({ title: "Fshij destinacionin?", text: "Ky veprim nuk mund të kthehet." }))) return;
    await fetch(`${API}/admin/destinations/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const toggleActive = async (d: Destination) => {
    const fd = new FormData();
    fd.append("active", String(!d.active));
    await fetch(`${API}/admin/destinations/${d.id}`, { method: "PATCH", body: fd, credentials: "include" });
    load();
  };

  const filteredDestinations = search.trim()
    ? destinations.filter(d => {
        const q = search.toLowerCase();
        return d.itinerary.toLowerCase().includes(q) || d.displayName.toLowerCase().includes(q);
      })
    : destinations;

  const allSelected = filteredDestinations.length > 0 && filteredDestinations.every(d => selectedIds.has(d.id));
  const someSelected = filteredDestinations.some(d => selectedIds.has(d.id));

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredDestinations.forEach(d => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...filteredDestinations.map(d => d.id)]));
    }
  };

  const bulkSetActive = async (active: boolean) => {
    const ids = filteredDestinations.filter(d => selectedIds.has(d.id));
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await Promise.all(ids.map(d => {
        const fd = new FormData();
        fd.append("active", String(active));
        return fetch(`${API}/admin/destinations/${d.id}`, { method: "PATCH", body: fd, credentials: "include" });
      }));
      toast({ title: active ? `${ids.length} destinacione u aktivizuan` : `${ids.length} destinacione u çaktivizuan` });
      setSelectedIds(new Set());
      load();
    } finally { setBulkLoading(false); }
  };

  const moveOrder = async (d: Destination, dir: -1 | 1) => {
    const newOrder = d.sortOrder + dir;
    const fd = new FormData();
    fd.append("sortOrder", String(newOrder));
    await fetch(`${API}/admin/destinations/${d.id}`, { method: "PATCH", body: fd, credentials: "include" });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Destinacione</h1>
          <p className="text-sm text-muted-foreground mt-1">Menaxho destinacionet për slideshow-in e faqes B2C</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {someSelected && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-blue-700">{selectedIds.size} zgjedhur</span>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={() => bulkSetActive(true)}
                className="gap-1.5 text-xs h-7 text-green-700 border-green-200 hover:bg-green-50"
              >
                {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                Aktivizo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={() => bulkSetActive(false)}
                className="gap-1.5 text-xs h-7 text-gray-600 border-gray-300 hover:bg-gray-50"
              >
                {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                Çaktivizo
              </Button>
              <button onClick={() => setSelectedIds(new Set())} className="text-blue-400 hover:text-blue-600 ml-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Shto Destinacion
          </Button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{editingId ? "Ndrysho Destinacion" : "Shto Destinacion të Ri"}</CardTitle>
              <button onClick={closeForm}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Itinerary (p.sh. TIA-BER) *</label>
                <input
                  value={form.itinerary}
                  onChange={e => setForm(f => ({ ...f, itinerary: e.target.value.toUpperCase() }))}
                  placeholder="TIA-BER"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Emri i shfaqur *</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Tiranë → Berlin"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mënyra e çmimit</label>
                <select
                  value={form.priceMode}
                  onChange={e => setForm(f => ({ ...f, priceMode: e.target.value as "auto" | "manual" }))}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="auto">Automatik (data e parë)</option>
                  <option value="manual">Zgjidh Datën</option>
                </select>
              </div>
              {form.priceMode === "manual" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data manuale</label>
                  <input
                    type="date"
                    value={form.manualDate}
                    onChange={e => setForm(f => ({ ...f, manualDate: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Rendi (sort)</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Photo Upload */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Foto</label>
              <div className="flex items-center gap-4">
                {form.photoPreview ? (
                  <div className="relative">
                    <img src={form.photoPreview} alt="" className="h-24 w-36 object-cover rounded-lg border" />
                    <button
                      onClick={() => setForm(f => ({ ...f, photo: null, photoPreview: null }))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="h-24 w-36 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors text-muted-foreground"
                  >
                    <Image className="h-6 w-6 mb-1" />
                    <span className="text-xs">Ngarko foto</span>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                {!form.photoPreview && (
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Zgjidh Foto
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm">{form.active ? "Aktiv" : "I çaktivizuar"}</span>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={closeForm} disabled={saving}>Anulo</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? "Ruaj Ndryshimet" : "Shto Destinacion"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Duke ngarkuar...
        </div>
      ) : destinations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Image className="h-10 w-10 opacity-20" />
            <p className="text-sm">Nuk ka destinacione akoma</p>
            <Button variant="outline" size="sm" onClick={openAdd} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Shto të parin
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Search + Select All row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Kërko destinacion..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
              />
              {allSelected ? "Çzgjidh të Gjitha" : "Zgjidh të Gjitha"}
              {someSelected && !allSelected && <span className="text-xs text-blue-600">({selectedIds.size} zgjedhur)</span>}
            </label>
            {search && (
              <span className="text-xs text-muted-foreground">{filteredDestinations.length} rezultate</span>
            )}
          </div>

          {filteredDestinations.map((d) => {
            const realIdx = destinations.indexOf(d);
            return (
            <Card key={d.id} className={`${!d.active ? "opacity-60" : ""} ${selectedIds.has(d.id) ? "ring-2 ring-primary/40 bg-primary/5" : ""} transition-all`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer shrink-0"
                  />
                   <PhotoPreview url={d.photoUrl} cardUrl={d.photoCardUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{d.itinerary}</span>
                      <span className="text-muted-foreground text-sm">·</span>
                      <span className="text-sm font-medium">{d.displayName}</span>
                      {!d.active && <Badge variant="secondary" className="text-[10px]">Çaktiv</Badge>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>
                        {d.priceMode === "manual" ? "📅 Manual" : "🔄 Automatik"}
                      </span>
                      <span>Data: <strong className="text-foreground">{fmtDate(d.resolvedDate)}</strong></span>
                      <span>Çmimi: <strong className={`${d.resolvedPrice ? "text-primary" : "text-muted-foreground"}`}>
                        {d.resolvedPrice ? `€${fmtM(d.resolvedPrice)}` : "—"}
                      </strong></span>
                      <span className="text-[10px]">Sort: {d.sortOrder}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveOrder(d, -1)} disabled={realIdx === 0} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveOrder(d, 1)} disabled={realIdx === destinations.length - 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(d)} className="p-1.5 rounded hover:bg-muted transition-colors">
                      {d.active
                        ? <ToggleRight className="h-4 w-4 text-primary" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
}
