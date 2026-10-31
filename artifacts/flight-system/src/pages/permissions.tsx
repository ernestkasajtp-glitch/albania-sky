import { useState, useEffect } from "react";
import {
  ShieldCheck, Loader2, Save, RotateCcw, Info, User,
  Trash2, UserCog, Check, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface PermissionsData {
  permissions: Record<string, Record<string, boolean>>;
  definitions: Record<string, string>;
  groups?: { label: string; icon: string; perms: string[] }[];
}

const ROLES = [
  { key: "manager",     label: "Menaxher",          color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  { key: "agent_staff", label: "Staf Agjentie",      color: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500"   },
];

// FALLBACK i vjeter — perdoret VETEM nese API nuk kthen `groups`.
// Backend tani eshte source-of-truth (PERMISSION_GROUPS te permissions.ts).
const FALLBACK_PERM_GROUPS: { label: string; icon: string; perms: string[] }[] = [
  {
    label: "Rezervimet",
    icon: "📋",
    perms: [
      "can_view_all_bookings",
      "can_create_bookings",
      "can_edit_bookings",
      "can_edit_booking_passengers",
      "can_edit_booking_status",
      "can_cancel_bookings",
      "can_delete_bookings",
      "can_export_bookings",
    ],
  },
  {
    label: "Fluturimet",
    icon: "✈️",
    perms: [
      "can_view_flights",
      "can_create_flights",
      "can_edit_flights",
      "can_delete_flights",
      "can_duplicate_flights",
      "can_toggle_flight_sales",
      "can_edit_flight_extras",
      "can_import_flights",
    ],
  },
  {
    label: "Pasagjerët",
    icon: "👤",
    perms: [
      "can_view_passengers",
      "can_edit_passenger_details",
      "can_view_passport_info",
      "can_export_passengers",
    ],
  },
  {
    label: "Financiare",
    icon: "💰",
    perms: [
      "can_view_financials",
      "can_view_profit",
      "can_view_commission",
      "can_edit_sell_price",
      "can_edit_markup",
      "can_suggest_price",
      "can_apply_discounts",
      "can_manage_payments",
      "can_refund_payments",
    ],
  },
  {
    label: "Raportet",
    icon: "📊",
    perms: [
      "can_view_reports",
      "can_view_sales_report",
      "can_view_route_report",
      "can_view_airline_report",
      "can_view_agent_report",
      "can_export_reports",
    ],
  },
  {
    label: "Agjentët",
    icon: "🏢",
    perms: [
      "can_view_agents",
      "can_create_agents",
      "can_edit_agents",
      "can_delete_agents",
      "can_manage_agent_wallet",
    ],
  },
  {
    label: "Tiketat Grup",
    icon: "🎫",
    perms: [
      "can_view_group_tickets",
      "can_create_group_tickets",
      "can_edit_group_tickets",
      "can_delete_group_tickets",
      "can_create_group_sales",
    ],
  },
  {
    label: "Statistikat (kartelat lart te Rezervimet)",
    icon: "📈",
    perms: [
      "can_view_stat_bookings_today",
      "can_view_stat_sales_today",
      "can_view_stat_profit_today",
      "can_view_stat_unpaid_total",
    ],
  },
  {
    label: "Toolbar i Rezervimeve (kërkim, filtra, numërimi)",
    icon: "🔎",
    perms: [
      "can_use_new_booking_button",
      "can_search_bookings",
      "can_filter_bookings_by_status",
      "can_filter_bookings_by_agent",
      "can_use_advanced_booking_filters",
      "can_view_bookings_total_count",
    ],
  },
  {
    label: "Sistemi",
    icon: "⚙️",
    perms: [
      "can_manage_users",
      "can_manage_integrations",
      "can_view_audit_log",
    ],
  },
];

export default function PermissionsPage() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [dirty, setDirty] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const PERM_GROUPS = (data?.groups && data.groups.length > 0) ? data.groups : FALLBACK_PERM_GROUPS;

  useEffect(() => {
    setExpandedGroups(prev => {
      const next = { ...prev };
      for (const g of PERM_GROUPS) if (next[g.label] === undefined) next[g.label] = true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<Record<string, boolean> | null>(null);
  const [userRolePerms, setUserRolePerms] = useState<Record<string, boolean>>({});
  const [userPermsDirty, setUserPermsDirty] = useState<Record<string, boolean>>({});
  const [userPermsSaving, setUserPermsSaving] = useState(false);
  const [userPermsLoading, setUserPermsLoading] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/permissions`, { credentials: "include" });
      if (resp.ok) setData(await resp.json());
    } catch {
      toast({ title: "Gabim gjatë ngarkimit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const resp = await fetch(`${API_BASE}/admin/users`, { credentials: "include" });
      if (resp.ok) {
        const all = await resp.json();
        setUsers(all.filter((u: any) => u.role === "manager" || u.role === "agent_staff"));
      }
    } catch {}
  };

  useEffect(() => { fetchData(); fetchUsers(); }, []);

  const loadUserPerms = async (userId: string) => {
    setUserPermsLoading(true);
    setUserPermsDirty({});
    try {
      const resp = await fetch(`${API_BASE}/permissions/user/${userId}`, { credentials: "include" });
      if (resp.ok) {
        const result = await resp.json();
        setUserPerms(result.overrides ?? {});
        const selectedUser = users.find((u: any) => String(u.id) === userId);
        if (selectedUser && data) {
          setUserRolePerms(data.permissions[selectedUser.role] ?? {});
        }
      }
    } finally {
      setUserPermsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) loadUserPerms(selectedUserId);
    else { setUserPerms(null); setUserPermsDirty({}); }
  }, [selectedUserId]);

  const getPermValue = (role: string, perm: string): boolean => {
    if (dirty[role]?.[perm] !== undefined) return dirty[role][perm];
    return data?.permissions[role]?.[perm] ?? false;
  };

  const handleToggle = (role: string, perm: string, val: boolean) => {
    setDirty(prev => ({ ...prev, [role]: { ...prev[role], [perm]: val } }));
  };

  const hasDirty = (role: string) => dirty[role] && Object.keys(dirty[role]).length > 0;
  const anyDirty = ROLES.some(r => hasDirty(r.key));

  const handleSave = async (role: string) => {
    if (!dirty[role]) return;
    setSaving(role);
    try {
      const resp = await fetch(`${API_BASE}/permissions/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(dirty[role]),
      });
      if (!resp.ok) throw new Error();
      toast({ title: `Lejet e ${ROLES.find(r => r.key === role)?.label || role} u ruajtën` });
      setDirty(prev => { const n = { ...prev }; delete n[role]; return n; });
      await fetchData();
    } catch {
      toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    for (const role of ROLES.map(r => r.key)) {
      if (hasDirty(role)) await handleSave(role);
    }
  };

  const handleReset = () => setDirty({});

  const getUserEffectiveValue = (perm: string): boolean => {
    if (userPermsDirty[perm] !== undefined) return userPermsDirty[perm];
    if (userPerms && userPerms[perm] !== undefined) return userPerms[perm];
    return userRolePerms[perm] ?? false;
  };

  const getUserOverride = (perm: string): boolean | undefined => {
    if (userPermsDirty[perm] !== undefined) return userPermsDirty[perm];
    return userPerms?.[perm];
  };

  const handleUserPermSave = async () => {
    if (!selectedUserId) return;
    setUserPermsSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/permissions/user/${selectedUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(userPermsDirty),
      });
      if (!resp.ok) throw new Error();
      toast({ title: "Lejet individuale u ruajtën" });
      setUserPermsDirty({});
      await loadUserPerms(selectedUserId);
    } catch {
      toast({ title: "Gabim gjatë ruajtjes", variant: "destructive" });
    } finally {
      setUserPermsSaving(false);
    }
  };

  const handleUserPermReset = async () => {
    if (!selectedUserId) return;
    setUserPermsSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/permissions/user/${selectedUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!resp.ok) throw new Error();
      toast({ title: "Lejet individuale u rivendosën" });
      setUserPermsDirty({});
      await loadUserPerms(selectedUserId);
    } catch {
      toast({ title: "Gabim gjatë rivendosjes", variant: "destructive" });
    } finally {
      setUserPermsSaving(false);
    }
  };

  const toggleGroup = (label: string) =>
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allPermKeys = data ? Object.keys(data.definitions) : [];
  const selectedUser = users.find((u: any) => String(u.id) === selectedUserId);
  const hasUserDirty = Object.keys(userPermsDirty).length > 0;
  const hasUserOverrides = userPerms && Object.keys(userPerms).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Lejet e Roleve
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Konfiguro çfarë mund të bëjë secili rol. Administratori ka gjithmonë të gjitha lejet.
          </p>
        </div>
        {anyDirty && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="h-8 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Anullo
            </Button>
            <Button size="sm" onClick={handleSaveAll} disabled={saving !== null} className="h-8 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Ruaj Ndryshimet
            </Button>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-700">
          <strong>Administratori</strong> ka gjithmonë të gjitha lejet — nuk mund të ndryshohen.
          Ndryshimet këtu zbatohen vetëm për <strong>Menaxherin</strong> dhe <strong>Stafin</strong>.
        </p>
      </div>

      {/* Permissions Matrix */}
      <Card className="border-gray-200 overflow-hidden">
        <CardHeader className="pb-3 border-b bg-gray-50/60">
          <CardTitle className="text-sm font-semibold text-gray-700">Matrica e Lejeve</CardTitle>
          <CardDescription className="text-xs">
            Aktivizo ose çaktivizo lejet për secilën rol duke klikuar switch-in
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Column headers */}
          <div className="grid border-b bg-white sticky top-0 z-10" style={{ gridTemplateColumns: "1fr repeat(2, 140px) 120px" }}>
            <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leja</div>
            {ROLES.map(role => (
              <div key={role.key} className="px-4 py-3 text-center border-l">
                <div className="flex flex-col items-center gap-1">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${role.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${role.dot}`} />
                    {role.label}
                  </div>
                  {hasDirty(role.key) && (
                    <span className="text-[10px] text-blue-500 font-medium">● ndryshuar</span>
                  )}
                </div>
              </div>
            ))}
            {/* Admin column (locked) */}
            <div className="px-4 py-3 text-center border-l">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Admin
              </div>
            </div>
          </div>

          {/* Permission groups */}
          {PERM_GROUPS.map(group => {
            const isOpen = expandedGroups[group.label];
            return (
              <div key={group.label}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-b hover:bg-gray-100 transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  }
                  <span className="text-sm">{group.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{group.label}</span>
                  <span className="ml-auto text-xs text-gray-400">{group.perms.length} leje</span>
                </button>

                {/* Permission rows */}
                {isOpen && group.perms.map((perm, idx) => {
                  const definition = data?.definitions[perm] || perm;
                  const isLastInGroup = idx === group.perms.length - 1;

                  return (
                    <div
                      key={perm}
                      className={`grid items-center ${isLastInGroup ? "border-b-2 border-gray-100" : "border-b border-gray-50"} hover:bg-blue-50/30 transition-colors`}
                      style={{ gridTemplateColumns: "1fr repeat(2, 140px) 120px" }}
                    >
                      {/* Permission name */}
                      <div className="px-5 py-3.5">
                        <div className="text-sm font-medium text-gray-800">{definition}</div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{perm}</div>
                      </div>

                      {/* Toggle per role */}
                      {ROLES.map(role => {
                        const val = getPermValue(role.key, perm);
                        const isDirtyItem = dirty[role.key]?.[perm] !== undefined;
                        return (
                          <div
                            key={role.key}
                            className={`flex items-center justify-center border-l py-3.5 transition-colors ${
                              isDirtyItem ? "bg-blue-50" : ""
                            }`}
                          >
                            <Switch
                              checked={val}
                              onCheckedChange={v => handleToggle(role.key, perm, v)}
                              className={`${val ? "data-[state=checked]:bg-green-500" : ""}`}
                            />
                          </div>
                        );
                      })}

                      {/* Admin — always on */}
                      <div className="flex items-center justify-center border-l py-3.5 bg-red-50/30">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <Check className="h-4 w-4 text-green-600" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Summary footer */}
          <div
            className="grid border-t bg-gray-50 py-2.5"
            style={{ gridTemplateColumns: "1fr repeat(2, 140px) 120px" }}
          >
            <div className="px-5 text-xs text-gray-500 flex items-center">
              Totali i lejeve aktive
            </div>
            {ROLES.map(role => {
              const activeCount = allPermKeys.filter(p => getPermValue(role.key, p)).length;
              return (
                <div key={role.key} className="flex flex-col items-center justify-center border-l gap-1">
                  <span className="text-lg font-bold text-gray-800">{activeCount}</span>
                  <span className="text-[10px] text-gray-400">/ {allPermKeys.length}</span>
                  {hasDirty(role.key) && (
                    <Button
                      size="sm"
                      onClick={() => handleSave(role.key)}
                      disabled={saving === role.key}
                      className="h-6 text-[10px] px-2 mt-1"
                    >
                      {saving === role.key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5 mr-1" />}
                      Ruaj
                    </Button>
                  )}
                </div>
              );
            })}
            <div className="flex flex-col items-center justify-center border-l gap-1">
              <span className="text-lg font-bold text-green-600">{allPermKeys.length}</span>
              <span className="text-[10px] text-gray-400">/ {allPermKeys.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-User Permissions */}
      <div className="pt-2 border-t">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Lejet Individuale (Override)
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Zëvendëso lejet për një user specifik — ka prioritet mbi lejet e rolit.
          </p>
        </div>

        <Card className="border-gray-200">
          <CardHeader className="pb-4 border-b bg-gray-50/60">
            <div className="flex items-center gap-3 flex-wrap">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedUserId ?? ""} onValueChange={v => setSelectedUserId(v || null)}>
                <SelectTrigger className="w-80">
                  <SelectValue placeholder="Zgjidh një user për override individual..." />
                </SelectTrigger>
                <SelectContent>
                  {users.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-400">Nuk ka user me rol manager/staf</div>
                  )}
                  {users.map((u: any) => {
                    const role = ROLES.find(r => r.key === u.role);
                    return (
                      <SelectItem key={u.id} value={String(u.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.name || u.email}</span>
                          {role && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${role.color}`}>
                              {role.label}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedUserId && (
                <div className="flex items-center gap-2 ml-auto">
                  {(hasUserDirty || hasUserOverrides) && (
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs h-7 text-red-500 hover:text-red-700"
                      onClick={handleUserPermReset}
                      disabled={userPermsSaving}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Fshi të Gjitha Overrides
                    </Button>
                  )}
                  {hasUserDirty && (
                    <Button size="sm" className="h-7 text-xs" onClick={handleUserPermSave} disabled={userPermsSaving}>
                      {userPermsSaving
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <Save className="h-3 w-3 mr-1" />
                      }
                      Ruaj Override
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          {selectedUserId && (
            <CardContent className="p-0">
              {userPermsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* User info header */}
                  {selectedUser && (
                    <div className="px-5 py-3 border-b bg-blue-50/50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                        {(selectedUser.name || selectedUser.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{selectedUser.name || selectedUser.email}</div>
                        <div className="text-xs text-gray-500">{selectedUser.email} · {ROLES.find(r => r.key === selectedUser.role)?.label}</div>
                      </div>
                      {hasUserOverrides && (
                        <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                          {Object.keys(userPerms!).length} override aktiv
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Column headers */}
                  <div className="grid border-b bg-white" style={{ gridTemplateColumns: "1fr 130px 130px" }}>
                    <div className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leja</div>
                    <div className="px-4 py-2.5 text-center border-l text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Default Roli
                    </div>
                    <div className="px-4 py-2.5 text-center border-l text-xs font-semibold text-primary uppercase tracking-wide">
                      Override User
                    </div>
                  </div>

                  {/* Permission rows with override */}
                  {PERM_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600">
                        <span>{group.icon}</span> {group.label}
                      </div>
                      {group.perms.map(perm => {
                        const effective = getUserEffectiveValue(perm);
                        const override = getUserOverride(perm);
                        const roleDefault = userRolePerms[perm] ?? false;
                        const hasDiff = override !== undefined && override !== roleDefault;
                        const isDirtyItem = userPermsDirty[perm] !== undefined;
                        const definition = data?.definitions[perm] || perm;

                        return (
                          <div
                            key={perm}
                            className={`grid items-center border-b border-gray-50 transition-colors ${
                              isDirtyItem  ? "bg-blue-50"
                              : hasDiff    ? "bg-amber-50/70"
                              : "hover:bg-gray-50/80"
                            }`}
                            style={{ gridTemplateColumns: "1fr 130px 130px" }}
                          >
                            <div className="px-5 py-3">
                              <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                                {definition}
                                {hasDiff && !isDirtyItem && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-amber-300 text-amber-700 bg-amber-50">
                                    override
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5">{perm}</div>
                            </div>

                            {/* Role default (read-only indicator) */}
                            <div className="flex items-center justify-center border-l py-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                roleDefault ? "bg-green-100" : "bg-gray-100"
                              }`}>
                                {roleDefault
                                  ? <Check className="h-3.5 w-3.5 text-green-600" />
                                  : <X className="h-3.5 w-3.5 text-gray-400" />
                                }
                              </div>
                            </div>

                            {/* User override switch */}
                            <div className="flex items-center justify-center border-l py-3">
                              <Switch
                                checked={effective}
                                onCheckedChange={val => setUserPermsDirty(prev => ({ ...prev, [perm]: val }))}
                                className={effective ? "data-[state=checked]:bg-green-500" : ""}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          )}

          {!selectedUserId && (
            <CardContent>
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <UserCog className="h-8 w-8 opacity-30" />
                <p className="text-sm">Zgjidh një user nga lista për të menaxhuar lejet e tij individuale</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
