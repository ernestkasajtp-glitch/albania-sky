import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AdminAuthProvider, useAdminAuth } from "@/context/AdminAuthContext";
import { ModulesProvider, useModules } from "@/context/ModulesContext";
import { useLiveUpdates } from "@/hooks/useLiveUpdates";
import { CreateTaskProvider } from "@/components/CreateTaskDialog";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ShieldAlert } from "lucide-react";

// Pages
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const FlightsList = lazy(() => import("@/pages/flights"));
const CitizenFlightsList = lazy(() => import("@/pages/citizen-flights"));
const ImportAlertsPage = lazy(() => import("@/pages/import-alerts"));
const AdminEmailPage = lazy(() => import("@/pages/admin-email"));
const ScheduleChangesPage = lazy(() => import("@/pages/schedule-changes"));
const FlightDetail = lazy(() => import("@/pages/flight-detail"));
const BookingsList = lazy(() => import("@/pages/bookings"));
const BookingNew = lazy(() => import("@/pages/booking-new"));
const BookingDetail = lazy(() => import("@/pages/booking-detail"));
const PassengersList = lazy(() => import("@/pages/passengers"));
const AgentsList = lazy(() => import("@/pages/agents"));
const AgentDetail = lazy(() => import("@/pages/agent-detail"));
const PaymentsList = lazy(() => import("@/pages/payments"));
const Reports = lazy(() => import("@/pages/reports"));
const UsersPage = lazy(() => import("@/pages/users"));
const PermissionsPage = lazy(() => import("@/pages/permissions"));
const PriceRequestsPage = lazy(() => import("@/pages/price-requests"));
const MyRequestsPage = lazy(() => import("@/pages/my-requests"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const IpAccessPage = lazy(() => import("@/pages/ip-access"));
const GooglePriceRulesPage = lazy(() => import("@/pages/google-price-rules"));
const DiscountsPage = lazy(() => import("@/pages/discounts"));
const GroupTicketsPage = lazy(() => import("@/pages/group-tickets"));
const IntegrationsPage = lazy(() => import("@/pages/integrations"));
const ScheduleCheckPage = lazy(() => import("@/pages/schedule-check"));
const FlightTypesPage = lazy(() => import("@/pages/flight-types"));
const DestinacionePage = lazy(() => import("@/pages/destinations"));
const FlightDiscoveryPage = lazy(() => import("@/pages/flight-discovery"));
const TasksPage = lazy(() => import("@/pages/tasks"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const AtlasSeatAlertsPage = lazy(() => import("@/pages/atlas-seat-alerts"));
const WizzPriceMonitorPage = lazy(() => import("@/pages/wizz-price-monitor"));
const KyteSearchPage = lazy(() => import("@/pages/kyte-search"));
const ClaimPage = lazy(() => import("@/pages/claim"));
const AssistantPage = lazy(() => import("@/pages/assistant"));
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { BookingPreviewDialog } from "@/components/BookingPreviewDialog";
import { TeamChatWidget } from "@/components/TeamChatWidget";
import { useChatEnabled } from "@/lib/chat-enabled";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Don't retry client errors (401/403/404/400…): the answer won't change, and the
// default 3 retries delayed the error message by several seconds. Network and
// 5xx errors still get up to 2 retries.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: unknown } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

// ─── Role-based route guard ───────────────────────────────────────────────────
function GuardedRoute({
  component: Comp,
  roles,
  notRoles,
  permission,
}: {
  component: React.ComponentType;
  roles?: string[];
  notRoles?: string[];
  permission?: string;
}) {
  const { user, hasPermission } = useAdminAuth();
  const role = user?.role ?? "";
  const isAdmin = role === "admin";

  // notRoles bllokon gjithmonë (p.sh. admin nuk sheh /my-requests).
  const deniedByNotRole = notRoles ? notRoles.includes(role) : false;
  // Admin ka çdo gjë. Për të tjerët: nëse faqja ka një 'permission', ajo është
  // AUTORITATIVE (leja vendos, jo roli) — kështu heqja e lejes te një menaxher
  // ka efekt edhe pse roli i tij është në listën 'roles'. Pa 'permission',
  // kontrollohet roli si më parë.
  let deniedByAccess = false;
  if (!isAdmin) {
    if (permission) deniedByAccess = !hasPermission(permission);
    else if (roles) deniedByAccess = !roles.includes(role);
  }

  if (deniedByAccess || deniedByNotRole) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 py-24">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-700">Akses i Ndaluar</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Nuk keni leje për të parë këtë faqe. Kontaktoni administratorin nëse mendoni se ky është gabim.
        </p>
      </div>
    );
  }

  return <Comp />;
}

function ProtectedRouter() {
  const { user, loading, hasAdmin } = useAdminAuth();
  const { loading: modulesLoading, error: modulesError, isPathEnabled } = useModules();
  const [location] = useLocation();
  const { theme } = useTheme();
  useLiveUpdates(!!user);

  if (loading || hasAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.mainBg }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.accentColor, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!user || hasAdmin === false) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <Layout>
      {modulesLoading && !location.startsWith("/settings") ? <RouteLoadingFallback /> : modulesError && !location.startsWith("/settings") ? (
        <div role="alert" data-testid="status-modules-error" className="mx-auto max-w-lg py-20 text-center text-red-700">
          Nuk mund të ngarkohen modulet. Faqet nuk hapen derisa të rikthehet lidhja. {modulesError}
        </div>
      ) : !isPathEnabled(location) ? (
        <div role="status" data-testid="status-module-disabled" className="mx-auto max-w-lg py-20 text-center">
          <ShieldAlert className="mx-auto mb-4 h-9 w-9 text-amber-600" />
          <h2 className="text-xl font-semibold">Kjo faqe është e çaktivizuar</h2>
          <p className="mt-2 text-sm text-muted-foreground">Moduli është fikur te Cilësimet → Faqet / Modulet. Të dhënat nuk janë fshirë.</p>
        </div>
      ) : <Suspense fallback={<RouteLoadingFallback />}>
        <Switch>
        {/* ── All authenticated FMS users ── */}
        <Route path="/"              component={Dashboard} />
        <Route path="/flights"       component={FlightsList} />
        <Route path="/flights/:id"   component={FlightDetail} />
        <Route path="/bookings"      component={BookingsList} />
        <Route path="/bookings/new"  component={BookingNew} />
        <Route path="/bookings/:id"  component={BookingDetail} />
        <Route path="/passengers"    component={PassengersList} />
        <Route path="/tasks"         component={TasksPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/claim"         component={ClaimPage} />
        <Route path="/assistant">
          {() => <GuardedRoute component={AssistantPage} roles={["admin"]} permission="can_access_reports" />}
        </Route>
        <Route path="/atlas-seat-alerts">
          {() => <GuardedRoute component={AtlasSeatAlertsPage} roles={["admin"]} />}
        </Route>

        {/* ── Admin + Manager only ── */}
        <Route path="/agents">
          {() => <GuardedRoute component={AgentsList} roles={["admin", "manager"]} permission="can_access_agents" />}
        </Route>
        <Route path="/agents/:id">
          {() => <GuardedRoute component={AgentDetail} roles={["admin", "manager"]} permission="can_access_agents" />}
        </Route>
        <Route path="/payments">
          {() => <GuardedRoute component={PaymentsList} roles={["admin", "manager"]} permission="can_access_payments" />}
        </Route>
        <Route path="/reports">
          {() => <GuardedRoute component={Reports} roles={["admin"]} permission="can_access_reports" />}
        </Route>
        <Route path="/group-tickets">
          {() => <GuardedRoute component={GroupTicketsPage} roles={["admin", "manager"]} permission="can_access_group_tickets" />}
        </Route>

        {/* ── Admin only ── */}
        <Route path="/discounts">
          {() => <GuardedRoute component={DiscountsPage} roles={["admin"]} />}
        </Route>
        <Route path="/offline-flights">
          {() => <GuardedRoute component={CitizenFlightsList} roles={["admin"]} />}
        </Route>
        <Route path="/admin-email">
          {() => <GuardedRoute component={AdminEmailPage} roles={["admin"]} />}
        </Route>
        <Route path="/import-alerts">
          {() => <GuardedRoute component={ImportAlertsPage} roles={["admin"]} />}
        </Route>
        <Route path="/schedule-changes">
          {() => <GuardedRoute component={ScheduleChangesPage} roles={["admin", "manager"]} />}
        </Route>
        <Route path="/users">
          {() => <GuardedRoute component={UsersPage} roles={["admin"]} permission="can_access_users" />}
        </Route>
        <Route path="/permissions">
          {() => <GuardedRoute component={PermissionsPage} roles={["admin"]} />}
        </Route>
        <Route path="/price-requests">
          {() => <GuardedRoute component={PriceRequestsPage} roles={["admin"]} />}
        </Route>
        <Route path="/settings/ip-access">
          {() => <GuardedRoute component={IpAccessPage} roles={["admin"]} />}
        </Route>
        <Route path="/settings">
          {() => <GuardedRoute component={SettingsPage} roles={["admin"]} />}
        </Route>
        <Route path="/price-rules">
          {() => <GuardedRoute component={GooglePriceRulesPage} roles={["admin"]} />}
        </Route>
        <Route path="/integrations">
          {() => <GuardedRoute component={IntegrationsPage} roles={["admin"]} />}
        </Route>
        <Route path="/schedule-check">
          {() => <GuardedRoute component={ScheduleCheckPage} roles={["admin"]} permission="can_access_schedule_check" />}
        </Route>
        <Route path="/flight-types">
          {() => <GuardedRoute component={FlightTypesPage} roles={["admin"]} />}
        </Route>
        <Route path="/destinations">
          {() => <GuardedRoute component={DestinacionePage} roles={["admin"]} permission="can_access_destinations" />}
        </Route>
        <Route path="/flight-discovery">
          {() => <GuardedRoute component={FlightDiscoveryPage} roles={["admin"]} />}
        </Route>
        <Route path="/wizz-price-monitor">
          {() => <GuardedRoute component={WizzPriceMonitorPage} roles={["admin"]} />}
        </Route>
        <Route path="/kyte-search">
          {() => <GuardedRoute component={KyteSearchPage} roles={["admin"]} />}
        </Route>

        {/* ── Non-admin FMS staff (manager / agent_staff) ── */}
        <Route path="/my-requests">
          {() => <GuardedRoute component={MyRequestsPage} notRoles={["admin"]} />}
        </Route>

        <Route component={NotFound} />
        </Switch>
      </Suspense>}
    </Layout>
  );
}

function RouteLoadingFallback() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.mainBg }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.accentColor, borderTopColor: "transparent" }} />
    </div>
  );
}

function ChatWidgetGate() {
  const enabled = useChatEnabled();
  return enabled ? <TeamChatWidget /> : null;
}

function App() {
  return (
    <>
    <UpdateNotifier />
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <AdminAuthProvider>
              <ModulesProvider>
                <CreateTaskProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <ProtectedRouter />
                  </WouterRouter>
                </CreateTaskProvider>
                <ChatWidgetGate />
              </ModulesProvider>
            </AdminAuthProvider>
            <BookingPreviewDialog />
            <Toaster />
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
    </>
  );
}

export default App;
