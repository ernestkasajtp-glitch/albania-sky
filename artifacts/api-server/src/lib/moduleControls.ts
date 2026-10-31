import { db, pool, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const KEY = "fms_module_controls_v1";
const TTL_MS = 1500;

export const moduleCatalogue = [
  { id: "flightDiscovery", label: "Zbulimi i fluturimeve", description: "Kërkimi i fluturimeve direkte dhe kandidatëve të rinj.", paths: ["/flight-discovery"] },
  { id: "wizzMonitor", label: "Monitorimi Wizz", description: "Kontrolli automatik i çmimeve të linjave Wizz.", paths: ["/wizz-price-monitor"] },
  { id: "kyte", label: "Kërkimi Kyte", description: "Kërkimi dhe rezervimet në mjedisin e provës Kyte.", paths: ["/kyte-search"] },
  { id: "atlasAlerts", label: "Sinjalizimet Atlas", description: "Kontrolli i vendeve të lira në Atlas.", paths: ["/atlas-seat-alerts"] },
  { id: "adminEmail", label: "Posta e administratorit", description: "Leximi dhe dërgimi i postës së brendshme.", paths: ["/admin-email"] },
  { id: "offlineFlights", label: "Fluturimet Offline", description: "Mjetet e menaxhimit të fluturimeve Offline; eksporti automatik i inventarit pas shitjeve vazhdon për sigurinë e rezervimeve.", paths: ["/offline-flights"] },
  { id: "scheduleCheck", label: "Kontrolli i orareve", description: "Nisja manuale e kontrolleve të orareve të fluturimeve.", paths: ["/schedule-check"] },
  { id: "scheduleChanges", label: "Ndryshimet e orareve", description: "Shqyrtimi i ndryshimeve të orareve; dërgimi i njoftimeve të domosdoshme për integritetin e rezervimeve vazhdon.", paths: ["/schedule-changes"] },
  { id: "googlePrices", label: "Çmimet Google", description: "Kontrolli i çmimeve dhe rregullat e çmimeve Google.", paths: ["/price-rules"] },
  { id: "reports", label: "Raportet", description: "Raportet dhe asistenti për analizë.", paths: ["/reports", "/assistant"] },
  { id: "tasks", label: "Detyrat", description: "Ndalon panelin dhe kërkesat e detyrave. Sinjalizimet e sigurisë për pasagjerë të dyfishtë dhe vende të shitura, të lidhura me rezervimet, mbeten aktive.", paths: ["/tasks"] },
  { id: "notifications", label: "Njoftimet", description: "Pamja e sinjalizimeve; monitorimi i sigurisë së rezervimeve dhe i vendeve të lira vazhdon.", paths: ["/notifications"] },
  { id: "agents", label: "Agjentët", description: "Administrimi i agjencive; kërkimi i agjentëve për rezervime mbetet i disponueshëm.", paths: ["/agents"] },
  { id: "payments", label: "Pagesat", description: "Administrimi i pagesave dhe kredive.", paths: ["/payments"], locked: true, reason: "Pagesat janë të përbashkëta me rezervimet dhe historinë financiare të agjentëve; bllokimi do të ndërpriste rrjedhat financiare aktive." },
  { id: "groupTickets", label: "Biletat në grup", description: "Administrimi i biletave në grup.", paths: ["/group-tickets"] },
  { id: "priceRequests", label: "Kërkesat për çmime", description: "Kërkesat për çmime dhe miratimi i tyre.", paths: ["/price-requests", "/my-requests"] },
  { id: "claim", label: "Kërkesat për dëmshpërblim", description: "Faqja e kërkesave për dëmshpërblim.", paths: ["/claim"] },
  { id: "destinations", label: "Destinacionet", description: "Menaxhimi i destinacioneve; kërkimi publik i destinacioneve mbetet aktiv.", paths: ["/destinations"] },
  { id: "importAlerts", label: "Sinjalizimet e importit", description: "Shqyrtimi i sinjalizimeve të importit Offline.", paths: ["/import-alerts"] },
  { id: "flightTypes", label: "Llojet e fluturimeve", description: "Konfigurimi i llojeve të fluturimeve.", paths: ["/flight-types"], locked: true, reason: "Konfigurimi i përbashkët përdoret nga shitjet aktive dhe faqja publike e rezervimeve." },
  { id: "dashboard", label: "Paneli kryesor", description: "Faqja kryesore e sistemit.", paths: ["/"], locked: true, reason: "Faqja kryesore duhet të mbetet e disponueshme." },
  { id: "flights", label: "Fluturimet", description: "Inventari i fluturimeve.", paths: ["/flights"], locked: true, reason: "Inventari ndahet me rezervimet, ndërfaqen e partnerëve dhe faqen publike të rezervimeve." },
  { id: "bookings", label: "Rezervimet", description: "Menaxhimi i rezervimeve.", paths: ["/bookings"], locked: true, reason: "Rezervimet ndahen me faqen publike dhe proceset e partnerëve." },
  { id: "passengers", label: "Pasagjerët", description: "Të dhënat e pasagjerëve.", paths: ["/passengers"], locked: true, reason: "Të dhënat kërkohen nga rezervimet dhe faqja publike." },
  { id: "settings", label: "Cilësimet", description: "Cilësimet e sistemit.", paths: ["/settings"], locked: true, reason: "Duhet të mbeten të disponueshme për të riaktivizuar modulet." },
  { id: "integrations", label: "Integrimet", description: "Lidhjet me partnerët dhe faqen publike të rezervimeve.", paths: ["/integrations"], locked: true, reason: "Ndërfaqja e partnerëve dhe faqja publike e rezervimeve duhet të mbeten aktive." },
  { id: "users", label: "Përdoruesit", description: "Menaxhimi i përdoruesve.", paths: ["/users"], locked: true, reason: "Kërkohet për rikthimin e llogarive dhe administrimin e aksesit." },
  { id: "permissions", label: "Lejet", description: "Lejet e roleve.", paths: ["/permissions"], locked: true, reason: "Kërkohen për administrimin e aksesit në sistem." },
] as const;

export type ModuleId = (typeof moduleCatalogue)[number]["id"];
type State = { revision: number; enabled: Partial<Record<ModuleId, boolean>>; lastChangedBy?: number; lastChangedAt?: string };
let cache: { state: State; until: number } | undefined;
let generation = 0;
let pending: { generation: number; promise: Promise<State> } | undefined;

function parseState(raw: string | null | undefined): State {
  if (raw === undefined) return { revision: 0, enabled: {} };
  if (raw === null) throw new Error("Invalid module settings");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid module settings");
  const obj = data as Record<string, unknown>;
  if (!Number.isSafeInteger(obj.revision) || (obj.revision as number) < 0 ||
      !obj.enabled || typeof obj.enabled !== "object" || Array.isArray(obj.enabled)) {
    throw new Error("Invalid module settings");
  }
  const enabled = obj.enabled as Record<string, unknown>;
  if (Object.entries(enabled).some(([id, value]) =>
    !moduleCatalogue.some(module => module.id === id) || typeof value !== "boolean")) {
    throw new Error("Invalid module settings");
  }
  return {
    revision: obj.revision as number, enabled: enabled as State["enabled"],
    lastChangedBy: typeof obj.lastChangedBy === "number" ? obj.lastChangedBy : undefined,
    lastChangedAt: typeof obj.lastChangedAt === "string" ? obj.lastChangedAt : undefined,
  };
}

export async function getModuleState(): Promise<State> {
  if (cache && Date.now() < cache.until) return cache.state;
  if (pending?.generation === generation) return pending.promise;
  const startGeneration = generation;
  const promise = (async () => {
    const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, KEY));
    const state = parseState(row?.value);
    if (startGeneration !== generation) return getModuleState();
    cache = { state, until: Date.now() + TTL_MS };
    return state;
  })();
  pending = { generation: startGeneration, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = undefined;
  }
}

export async function isModuleEnabled(id: string): Promise<boolean> {
  const entry = moduleCatalogue.find(module => module.id === id);
  if (!entry) return false;
  if ("locked" in entry) return true;
  try {
    const state = await getModuleState();
    return state.enabled[entry.id] !== false;
  } catch (err) {
    console.error("Module settings unavailable; denying module access", err);
    return false;
  }
}

export function moduleEnvelope(state: State) {
  return {
    revision: state.revision,
    modules: moduleCatalogue.map(module => ({
      ...module, enabled: "locked" in module ? true : state.enabled[module.id] !== false,
      locked: "locked" in module,
    })),
  };
}

export async function setModuleEnabled(id: ModuleId, enabled: boolean, actorId: number): Promise<State> {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error("Missing actor ID for module audit");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [KEY, JSON.stringify({ revision: 0, enabled: {} })]);
    const result = await client.query("SELECT value FROM settings WHERE key = $1 FOR UPDATE", [KEY]);
    const previous = parseState(result.rows[0]?.value);
    const state: State = {
      revision: previous.revision + 1, enabled: { ...previous.enabled, [id]: enabled },
      lastChangedBy: actorId, lastChangedAt: new Date().toISOString(),
    };
    await client.query("UPDATE settings SET value = $2, updated_at = NOW() WHERE key = $1", [KEY, JSON.stringify(state)]);
    await client.query("INSERT INTO settings (key, value) VALUES ($1, $2)", [
      `${KEY}_audit_${state.revision}`,
      JSON.stringify({ revision: state.revision, moduleId: id, before: previous.enabled[id] !== false,
        after: enabled, actorId, changedAt: state.lastChangedAt }),
    ]);
    await client.query("COMMIT");
    generation++;
    cache = { state, until: Date.now() + TTL_MS };
    return state;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}