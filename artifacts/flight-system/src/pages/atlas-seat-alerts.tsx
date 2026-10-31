import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ExternalLink, RefreshCw, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type AtlasAlert = {
  id: number;
  airline: string;
  flightNumber: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  totalSeats: number;
  soldSeats: number;
  availableSeats: number;
  checkedAt: string;
};

type AtlasState = {
  status: "idle" | "running" | "completed" | "error";
  startedAt: string | null;
  completedAt: string | null;
  totalFlights: number;
  checkedFlights: number;
  alerts: AtlasAlert[];
  error: string | null;
};

const emptyState: AtlasState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  totalFlights: 0,
  checkedFlights: 0,
  alerts: [],
  error: null,
};

const fmtDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
};

const fmtCheckedAt = (value: string | null) => {
  if (!value) return "Ende pa kontrolluar";
  return new Date(value).toLocaleString("sq-AL", {
    timeZone: "Europe/Tirane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
};

export default function AtlasSeatAlertsPage() {
  const [data, setData] = useState<AtlasState>(emptyState);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const response = await fetch(`${API_BASE}/atlas-seat-alerts`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Nuk u lexuan rezultatet Atlas.");
    setData(await response.json());
  };

  useEffect(() => {
    refresh().catch(() => setData(prev => ({ ...prev, status: "error", error: "Nuk u lexuan rezultatet Atlas." })))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (data.status !== "running") return;
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [data.status]);

  const run = async () => {
    setData(prev => ({ ...prev, status: "running", error: null }));
    const response = await fetch(`${API_BASE}/atlas-seat-alerts/run`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      setData(prev => ({ ...prev, status: "error", error: "Kontrolli Atlas nuk u nis." }));
      return;
    }
    setData(await response.json());
  };

  const progress = data.totalFlights > 0
    ? Math.round((data.checkedFlights / data.totalFlights) * 100)
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Radar className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Njoftime Atlas</h1>
            <p className="text-sm text-muted-foreground">
              Vetëm fluturimet me më pak se 9 vende të rezervueshme
            </p>
          </div>
        </div>
        <Button onClick={run} disabled={data.status === "running"}>
          <RefreshCw className={`h-4 w-4 mr-2 ${data.status === "running" ? "animate-spin" : ""}`} />
          {data.status === "running" ? "Duke kontrolluar…" : "Kontrollo me Atlas"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>Gjendja: <strong>{data.status === "running" ? "Në proces" : data.status === "completed" ? "Përfunduar" : data.status === "error" ? "Gabim" : "Pa nisur"}</strong></span>
            <span>Kontrolluar: <strong>{data.checkedFlights}/{data.totalFlights}</strong></span>
            <span>Njoftime: <strong className="text-red-600">{data.alerts.length}</strong></span>
            <span className="text-muted-foreground">Përditësimi: {fmtCheckedAt(data.completedAt || data.startedAt)}</span>
          </div>
          {data.status === "running" && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {data.error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" /> {data.error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluturimet me më pak se 9 vende</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Duke ngarkuar…</div>
          ) : data.alerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {data.status === "completed"
                ? "Nuk u gjet asnjë fluturim me më pak se 9 vende."
                : "Shtyp “Kontrollo me Atlas” për të nisur kontrollin informativ."}
            </div>
          ) : (
            <div className="divide-y">
              {data.alerts.map(flight => (
                <div key={flight.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{flight.flightNumber}</strong>
                      <span className="font-semibold">{flight.fromCity} → {flight.toCity}</span>
                      <Badge variant="destructive">
                        {flight.availableSeats === 0 ? "Nuk gjendet për 1–9" : `${flight.availableSeats} vende`}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {fmtDate(flight.departureDate)} · {flight.departureTime}–{flight.arrivalTime}
                      {" · "}Kontrolluar {fmtCheckedAt(flight.checkedAt)}
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/flights/${flight.id}`}>
                      Hap fluturimin <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}