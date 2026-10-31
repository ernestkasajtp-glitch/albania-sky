import { X, History, User, Clock, ArrowRight, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface ChangeLogEntry {
  id: number;
  bookingId: number;
  userName: string | null;
  userRole: string | null;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; dot?: string; linkable?: boolean }> = {
  created:                 { label: "Krijuar",              color: "bg-blue-100 text-blue-700",     dot: "bg-blue-400" },
  updated:                 { label: "Përditësuar",           color: "bg-gray-100 text-gray-700",     dot: "bg-gray-400" },
  status_changed:          { label: "Statusi Ndryshuar",     color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-400" },
  confirmed:               { label: "Konfirmuar",            color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500" },
  cancelled:               { label: "Anuluar",               color: "bg-red-100 text-red-700",       dot: "bg-red-400" },
  ticketed:                { label: "Ticketed",              color: "bg-green-100 text-green-700",   dot: "bg-green-600" },
  payment_added:           { label: "Pagesë Shtuar",         color: "bg-green-100 text-green-700",   dot: "bg-green-500" },
  payment_refund:          { label: "Rimbursim",              color: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  passenger_added:         { label: "Pasagjer Shtuar",       color: "bg-sky-100 text-sky-700",       dot: "bg-sky-400" },
  passenger_updated:       { label: "Pasagjer Ndryshuar",    color: "bg-amber-100 text-amber-700",   dot: "bg-amber-400" },
  passenger_removed:       { label: "Pasagjer Fshirë",       color: "bg-rose-100 text-rose-700",     dot: "bg-rose-400" },
  extra_added:             { label: "Extra Shtuar",        color: "bg-purple-100 text-purple-700", dot: "bg-purple-400" },
  extra_updated:           { label: "Extra Ndryshuar",     color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  extra_removed:           { label: "Extra Fshirë",        color: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  price_approved:          { label: "Çmim Aprovuar",         color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  net_price_approved:      { label: "Çmim Neto Aprov.",      color: "bg-teal-100 text-teal-700",     dot: "bg-teal-500" },
  price_request_approved:  { label: "Kërkesë Aprovuar",      color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  price_request_rejected:  { label: "Kërkesë Refuzuar",      color: "bg-red-100 text-red-700",       dot: "bg-red-400" },
  price_request_submitted: { label: "Kërkesë Çmimi",         color: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  ticket_search:           { label: "Kërkim Bilete në Email", color: "bg-pink-100 text-pink-700",    dot: "bg-pink-400" },
  status_email:            { label: "Email Statusi (Agjent)", color: "bg-cyan-100 text-cyan-700",    dot: "bg-cyan-500" },
};

const FIELD_LABELS: Record<string, string> = {
  totalAmount:         "Çmimi i Shitjes",
  netPrice:            "Çmimi Neto",
  pnr:                 "PNR",
  status:              "Statusi",
  notes:               "Shënime",
  commissionAmount:    "Komisioni",
  customerName:        "Emri i Klientit",
  customerEmail:       "Email",
  customerPhone:       "Telefon",
  markup:              "Markup",
  commission:          "Komision",
  firstName:           "Emri",
  lastName:            "Mbiemri",
  dateOfBirth:         "Datëlindja",
  nationality:         "Kombësia",
  passportNumber:      "Nr. Pasaporte",
  passportExpiry:      "Skadimi Pasaporte",
  seatNumber:          "Vendi i Uljes",
  baggageOption:       "Bagazhi",
  hasSeatSelection:    "Zgjedhja e Vendit",
  hasPriorityBoarding: "Prioritet Boarding",
  hasInsurance:        "Sigurim",
};

interface ChangeLogPanelProps {
  open: boolean;
  onClose: () => void;
  bookingId: number;
  bookingRef: string;
}

const MASKED_FIELDS_NON_ADMIN = new Set(["customerPhone", "customerEmail"]);

export function ChangeLogPanel({ open, onClose, bookingId, bookingRef }: ChangeLogPanelProps) {
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const { data: logs = [], isLoading: loading } = useQuery<ChangeLogEntry[]>({
    queryKey: [`/api/bookings/${bookingId}/change-log`],
    enabled: open && !!bookingId,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/bookings/${bookingId}/change-log`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Nuk u mor dot historiku i ndryshimeve");
      return response.json();
    },
  });

  if (!open) return null;

  const visibleLogs = isAdmin
    ? logs
    : logs.filter((log) => !(log.fieldName && MASKED_FIELDS_NON_ADMIN.has(log.fieldName)));

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Historiku i Ndryshimeve</span>
            <Badge variant="outline" className="font-mono text-xs">{bookingRef}</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Duke ngarkuar...</div>
          ) : visibleLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Nuk ka histori ndryshimesh</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {visibleLogs.map((log) => {
                  const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: "bg-gray-100 text-gray-700" };
                  const fieldLabel = log.fieldName ? (FIELD_LABELS[log.fieldName] ?? log.fieldName) : null;
                  return (
                    <div key={log.id} className="relative pl-8">
                      <div className={`absolute left-2 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${cfg.dot ?? "bg-gray-400"}`} />
                      <div className="bg-gray-50 rounded-lg border p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-xs font-medium ${cfg.color} border-0`}>{cfg.label}</Badge>
                            {cfg.linkable && (
                              <Link href={`/bookings/${log.bookingId}`} onClick={onClose}
                                className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline">
                                <ExternalLink className="h-2.5 w-2.5" /> Rezervim
                              </Link>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(log.createdAt), "dd MMM yyyy h:mm a")}
                          </span>
                        </div>

                        {log.userName && log.userName !== "System" && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="font-medium text-foreground">{log.userName}</span>
                            {log.userRole && (
                              <span className="capitalize opacity-60">· {log.userRole}</span>
                            )}
                          </div>
                        )}

                        {fieldLabel && (log.oldValue !== null || log.newValue !== null) && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{fieldLabel}:</span>{" "}
                            {log.oldValue !== null && (
                              <span className="line-through text-red-500/70">{log.oldValue}</span>
                            )}
                            {log.oldValue !== null && log.newValue !== null && (
                              <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                            )}
                            {log.newValue !== null && (
                              <span className="text-green-600 font-medium">{log.newValue}</span>
                            )}
                          </div>
                        )}

                        {log.note && log.action !== "status_email" && (
                          <p className="text-xs text-muted-foreground italic border-t pt-1.5 mt-1.5">
                            {log.note}
                          </p>
                        )}
                        {log.action === "status_email" && (() => {
                          try {
                            const outcome = JSON.parse(log.note || "{}");
                            const label = outcome.outcome === "sent"
                              ? `U dërgua${outcome.email ? ` te ${outcome.email}` : ""}`
                              : outcome.outcome === "failed"
                                ? `Dështoi · ${outcome.reason || "Arsye e panjohur"}`
                                : `U anashkalua · ${outcome.reason || "Arsye e panjohur"}`;
                            return <p className="text-xs text-muted-foreground border-t pt-1.5 mt-1.5">{label}</p>;
                          } catch {
                            return <p className="text-xs text-muted-foreground border-t pt-1.5 mt-1.5">Pa të dhëna për emailin</p>;
                          }
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
