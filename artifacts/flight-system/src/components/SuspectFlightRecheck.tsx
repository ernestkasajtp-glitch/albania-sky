type State = {
  outcome: "found" | "missing" | "error" | "empty";
  checkedAt: string;
  missingChecks: number;
};
export function SuspectFlightRecheck({ state, detail }: { state?: State | null; detail?: string | null }) {
  // Para rikontrollit të parë: shfaq arsyen nga kontrolli fillestar (p.sh. "Kontrolli dështoi...")
  const cleanDetail = (detail || "").trim();
  const preDetail = cleanDetail || "Nuk u gjet në Google";
  const label = !state ? `${preDetail} · në pritje të rikontrollit`
    : state.outcome === "found" ? "U gjet përsëri në Google"
    : state.outcome === "error" ? "Kontrolli dështoi (jo anulim)"
    : state.outcome === "empty" ? "Pa rezultat të besueshëm"
    : state.missingChecks >= 5
      ? `Mungon në ${state.missingChecks} kontrolle Google · Mundësi anulimi`
      : `Mungon në ${state.missingChecks} kontroll${state.missingChecks === 1 ? "" : "e"} Google`;
  const color = state?.outcome === "found" ? "bg-green-100 text-green-800"
    : state?.outcome === "missing" && state.missingChecks >= 5 ? "bg-red-100 text-red-800"
    : "bg-amber-50 text-amber-800";
  return <span className="ml-2 inline-flex flex-col align-middle gap-0.5" data-testid="status-suspect-recheck">
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${color}`}
      title={`${cleanDetail ? cleanDetail + " — " : ""}Rikontroll çdo 5 minuta, sipas disponueshmërisë së Google. Mungesa ose kontrolli i dështuar nuk provon anulim. Lista përditësohet kur verifikohen kodi dhe oraret.`}>
      {label}
    </span>
    <span className="text-[10px] text-muted-foreground">
      {state ? `Kontrolli: ${new Date(state.checkedAt).toLocaleString("sq-AL", {
        timeZone: "Europe/Tirane", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })}` : "Cikli: 5 minuta"}
    </span>
  </span>;
}
