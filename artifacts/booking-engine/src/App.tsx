import { Switch, Route, Router as WouterRouter, Link, useLocation, Redirect } from "wouter";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
const Home = externalPageComponent("home");
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PaymentReturn from "@/pages/PaymentReturn";
import { externalPageComponent, ExternalLayoutsProvider, useAirlineLayout } from "@/lib/pageLayouts";

const Flights = externalPageComponent("flights");
const BookFlight = externalPageComponent("book_flight");
const MyBookings = externalPageComponent("my_bookings");
const BookingDetail = externalPageComponent("booking_detail");
import { useTranslation } from "react-i18next";
import { ActivityTracker } from "@/components/ActivityTracker";

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="text-7xl font-black text-gray-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{t("Faqja nuk u gjet")}</h1>
        <p className="text-gray-500 mb-6">{t("Faqja që kërkoni nuk ekziston ose u zhvendos.")}</p>
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-white px-6 py-3 rounded-xl text-sm"
          style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}>
          {t("Kthehu në Kryefaqe")}
        </Link>
      </div>
    </div>
  );
}

function VisitTracker() {
  return <ActivityTracker />;
}

function SignedInSearch({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [path] = useLocation();
  if (loading) return null;
  if (!user) return <Redirect to={`/login?redirect=${encodeURIComponent(path + window.location.search)}`} />;
  return <>{children}</>;
}

function ApprovalBoundary({ children }: { children: ReactNode }) {
  const { user, loading, refresh, logout } = useAuth();
  const [location] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Historical bookings and their payments remain available.
  if (loading) return <p className="p-10 text-center">Duke ngarkuar...</p>;
  if (!user?.pendingApproval || location.startsWith("/my-bookings") || location === "/payment-return") return <>{children}</>;
  return <main className="mx-auto max-w-xl px-6 py-20 text-center" data-testid="pending-approval">
    <h1 className="text-2xl font-bold">Llogaria juaj është në pritje të miratimit</h1>
    <p className="my-5 text-slate-600">Administratori duhet të konfirmojë regjistrimin dhe t'ju caktojë një grup përpara kërkimit dhe rezervimit të fluturimeve.</p>
    <button data-testid="button-check-approval" disabled={busy} className="rounded bg-blue-900 px-5 py-3 text-white" onClick={async () => { setBusy(true); setError(""); try { await refresh(); } catch { setError("Statusi nuk u kontrollua. Provoni përsëri."); } finally { setBusy(false); } }}>Kontrollo statusin</button>
    <button data-testid="button-logout-pending" disabled={busy} className="ml-4 underline" onClick={async () => { setBusy(true); try { await logout(); } catch { setError("Dalja dështoi. Provoni përsëri."); } finally { setBusy(false); } }}>Dil nga llogaria</button>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
  </main>;
}
function AppLayout() {
  const [path] = useLocation();
  const airline = useAirlineLayout(path);
  return (
    <AuthProvider>
      <VisitTracker />
      <div className={`min-h-screen ${airline ? "air-shell" : ""} ${airline && path === "/" ? "air-home-shell" : ""}`}>
        <Navbar />
        <ApprovalBoundary><Switch>
          <Route path="/" component={Home} />
          <Route path="/flights"><SignedInSearch><Flights /></SignedInSearch></Route>
          <Route path="/flights/:id"><SignedInSearch><BookFlight /></SignedInSearch></Route>
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/my-bookings" component={MyBookings} />
          <Route path="/my-bookings/:ref" component={BookingDetail} />
          <Route path="/payment-return" component={PaymentReturn} />
          <Route component={NotFound} />
        </Switch></ApprovalBoundary>
      </div>
    </AuthProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <ExternalLayoutsProvider><AppLayout /></ExternalLayoutsProvider>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
