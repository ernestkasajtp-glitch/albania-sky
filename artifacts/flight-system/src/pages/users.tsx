import { useState, useEffect } from "react";
import { UserPlus, Trash2, KeyRound, Pencil, Eye, EyeOff, Loader2, ShieldCheck, UserCog, Building2, X } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { confirmDangerDialog } from "@/lib/confirm";
import { GroupSelector } from "@/components/AgencyGroups";
import { useQueryClient } from "@tanstack/react-query";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const ROLE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; desc: string }> = {
  manager: {
    label: "Manager",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
    icon: <ShieldCheck className="h-4 w-4" />,
    desc: "Akses në FMS Pro – roli dhe të drejtat plotësohen më vonë",
  },
  agent_staff: {
    label: "Agent",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    icon: <UserCog className="h-4 w-4" />,
    desc: "Akses në FMS Pro – roli dhe të drejtat plotësohen më vonë",
  },
  agent: {
    label: "Agency",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: <Building2 className="h-4 w-4" />,
    desc: "Akses vetëm në Booking Engine (SkyBook)",
  },
};

interface User {
  id: number; email: string; name: string; role: string;
  company: string | null; phone: string | null; createdAt: string;
  agentId?: number | null; agentName?: string | null;
}

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role];
  if (!m) return <span className="text-xs text-gray-400">{role}</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: me, hasPermission } = useAdminAuth();
  const isAdmin = me?.role === "admin";
  const canManage = isAdmin || hasPermission("can_manage_users");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pwModal, setPwModal] = useState<User | null>(null);
  const [editModal, setEditModal] = useState<User | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${API}/admin/users`, { credentials: "include" })
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setUsers(data); else setUsers([]); }).catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteUser = async (u: User) => {
    if (!(await confirmDangerDialog({ title: "Fshij përdoruesin?", text: `A jeni i sigurt që doni të fshini "${u.name}"? Ky veprim nuk mund të kthehet.` }))) return;
    const r = await fetch(`${API}/admin/users/${u.id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Gabim gjatë fshirjes.");
      return;
    }
    load();
  };

  const groups = {
    manager: users.filter(u => u.role === "manager"),
    agent_staff: users.filter(u => u.role === "agent_staff"),
    agent: users.filter(u => u.role === "agent"),
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Përdoruesit</h1>
          <p className="text-sm text-gray-500 mt-0.5">Menaxho stafin dhe agjencitë</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
            <UserPlus className="h-4 w-4" /> Krijo Përdorues
          </button>
        )}
      </div>

      {/* Role type cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(["manager", "agent_staff", "agent"] as const).map(role => {
          const m = ROLE_META[role];
          return (
            <div key={role} className={`border rounded-2xl p-4 ${m.bg}`}>
              <div className={`flex items-center gap-2 font-semibold ${m.color} mb-1`}>
                {m.icon} {m.label}
              </div>
              <p className="text-xs text-gray-500 mb-2">{m.desc}</p>
              <div className={`text-2xl font-bold ${m.color}`}>{groups[role].length}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nuk ka asnjë përdorues akoma</p>
          <p className="text-sm mt-1">Klikoni "Krijo Përdorues" për të shtuar stafin ose agjencitë tuaja</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["manager", "agent_staff", "agent"] as const).map(role => {
            if (groups[role].length === 0) return null;
            const m = ROLE_META[role];
            return (
              <div key={role}>
                <div className={`flex items-center gap-2 text-sm font-semibold mb-2 ${m.color}`}>
                  {m.icon} {m.label} <span className="font-normal text-gray-400">({groups[role].length})</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left">Emri</th>
                        <th className="px-4 py-2.5 text-left">Email</th>
                        {role === "agent" && <th className="px-4 py-2.5 text-left">Kompania</th>}
                        <th className="px-4 py-2.5 text-left">Krijuar</th>
                        {canManage && <th className="px-4 py-2.5 text-right w-44">Veprime</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {groups[role].map(u => (
                        <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{u.name}
                            {isAdmin && u.agentId && <div className="text-xs font-normal text-gray-500 mt-1">
                              Agjenti: {u.agentName || `#${u.agentId}`}
                            </div>}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{u.email}</td>
                          {role === "agent" && <td className="px-4 py-3 text-gray-500">{u.company || "—"}</td>}
                          <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString("sq-AL")}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => setEditModal(u)} title="Ndrysho të dhënat (email, emër)"
                                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setPwModal(u)} title="Ndrysho fjalëkalimin"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                  <KeyRound className="h-3.5 w-3.5" />
                                  Ndrysho pass
                                </button>
                                {isAdmin && (
                                <button onClick={() => deleteUser(u)} title="Fshi"
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateUserModal isAdmin={isAdmin} onClose={() => setShowCreate(false)} onCreated={() => { load(); queryClient.invalidateQueries({ queryKey: ["/api/agents"] }); queryClient.invalidateQueries({ queryKey: ["agency-groups"] }); }} />}
      {pwModal && <ChangePasswordModal user={pwModal} onClose={() => setPwModal(null)} />}
      {editModal && <EditUserModal user={editModal} onClose={() => setEditModal(null)} onSaved={load} />}
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────
export function CreateUserModal({ onClose, onCreated, isAdmin, fixedAgent }: { onClose: () => void; onCreated: () => void; isAdmin: boolean; fixedAgent?: { id: number; name: string } }) {
  const [role, setRole] = useState<"manager" | "agent_staff" | "agent">(fixedAgent ? "agent" : "manager");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [agentId, setAgentId] = useState<number | null>(fixedAgent?.id ?? null);
  const [agents, setAgents] = useState<{ id: number; name: string; company: string | null }[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentsLoading, setAgentsLoading] = useState(isAdmin);
  const [agentsError, setAgentsError] = useState("");
  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetch(`${API}/admin/user-agent-options`, { credentials: "include", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("Lista e agjentëve nuk u ngarkua. Rihapni formularin."); return r.json(); })
      .then(setAgents)
      .catch(e => { if (e.name !== "AbortError") setAgentsError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setAgentsLoading(false); });
    return () => controller.abort();
  }, [isAdmin]);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (role === "agent" && (!isAdmin || (agentId === null && groupId === null))) {
      setError("Vetëm administratori mund të krijojë agjenci. Zgjidhni grupin e agjencisë.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/users`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name, email, password, company: company || undefined, phone: phone || undefined, ...(isAdmin ? { agentId } : {}), ...(role === "agent" && agentId === null ? { groupId } : {}) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: `Gabim serveri (${r.status})` }));
        throw new Error(d.error || `Gabim serveri (${r.status})`);
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gabim");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Krijo Përdorues të Ri</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Lloji i Përdoruesit</label>
            <div className="grid grid-cols-3 gap-2">
              {(["manager", "agent_staff", ...(isAdmin ? ["agent" as const] : [])] as const).map(r => {
                const m = ROLE_META[r];
                return (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${role === r ? `${m.bg} ${m.color} border-current font-semibold` : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {m.icon}
                    <span className="text-xs">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">{ROLE_META[role].desc}</p>
          </div>
          {fixedAgent && <p className="rounded-lg bg-blue-50 p-3 text-sm">Agjenti: <strong>{fixedAgent.name}</strong>. Llogaria do të ketë akses te të dhënat e kësaj agjencie në portal. Roli i FMS mbetet sipas zgjedhjes më sipër.</p>}
          {isAdmin && !fixedAgent && <div className="rounded-xl border border-gray-200 p-3 space-y-2">
            <label htmlFor="user-agent-link" className="block text-xs font-medium text-gray-700">Lidh me agjentin (opsionale)</label>
            <input aria-label="Kërko agjentin" placeholder="Kërko sipas emrit ose kompanisë…"
              value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select id="user-agent-link" value={agentId ?? ""} disabled={agentsLoading || !!agentsError}
              onChange={e => setAgentId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">{agentsLoading ? "Duke ngarkuar agjentët…" : "Pa lidhje të zgjedhur"}</option>
              {agents.filter(a => a.id === agentId || `${a.name} ${a.company ?? ""}`.toLowerCase().includes(agentSearch.toLowerCase()))
                .map(a => <option key={a.id} value={a.id}>{a.name}{a.company && a.company !== a.name ? ` — ${a.company}` : ""} (#{a.id})</option>)}
            </select>
            {agentsError && <p role="alert" className="text-xs text-red-600">{agentsError}</p>}
            {!agentsLoading && !agentsError && agents.length === 0 && <p className="text-xs text-gray-500">Nuk ka agjentë aktivë.</p>}
            <p className="text-xs text-gray-500">{agentId !== null
              ? "Ky përdorues do të ketë akses te rezervimet dhe të dhënat e kësaj agjencie në portalin e jashtëm. Roli dhe lejet e FMS nuk ndryshojnë. Agjenti dhe grupi i tij nuk ndryshohen."
              : "Zgjidhni agjentin ekzistues që të mos krijoni një agjenci tjetër. Emaili i hyrjes mund të jetë ndryshe."}</p>
          </div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Emri i plotë *</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Fjalëkalimi *</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            {role === "agent" && <>
              {agentId === null && <GroupSelector value={groupId} onChange={setGroupId} required />}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Kompania</label>
                <input value={company} onChange={e => setCompany(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 font-medium py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              Anulo
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Krijo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [company, setCompany] = useState(user.company || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/users/${user.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company: company || undefined, phone: phone || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Gabim"); }
      setDone(true);
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch (err: any) {
      setError(err.message || "Gabim");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Ndrysho të Dhënat</h2>
            <p className="text-xs text-gray-400 mt-0.5">{user.name} — të dhënat e login-it</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
            Fjalëkalimi aktual nuk mund të shfaqet për arsye sigurie. Vendosni një të ri dhe përdorni ikonën e syrit për ta parë gjatë shkrimit.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Emri *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email (për login) *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {user.role === "agent" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kompania</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Telefoni</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}
          {done && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl px-3 py-2">U ruajt me sukses!</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">Anulo</button>
            <button type="submit" disabled={loading || done}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ruaj
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/users/${user.id}/password`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message || "Gabim");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Ndrysho Fjalëkalimin</h2>
            <p className="text-xs text-gray-400 mt-0.5">{user.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fjalëkalimi i ri *</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}
          {done && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl px-3 py-2">U ndryshua me sukses!</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">Anulo</button>
            <button type="submit" disabled={loading || done}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ruaj
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
