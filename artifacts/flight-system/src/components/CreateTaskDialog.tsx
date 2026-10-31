import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, X, Link2, Zap, ArrowUpCircle, ArrowDownCircle, MinusCircle, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export type CreateTaskEntityType = "booking" | "agent" | "flight" | "group_ticket";
export interface CreateTaskPrefill {
  entityType: CreateTaskEntityType;
  entityId: number;
  entityRef?: string;
  entitySublabel?: string;
  title?: string;
}

type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
interface StaffUser { id: number; name: string; role: string; }

const PRIORITY_META: Record<TaskPriority, { label: string; icon: any; color: string }> = {
  urgent: { label: "Urgjent", icon: Zap,             color: "text-rose-600" },
  high:   { label: "Lartë",   icon: ArrowUpCircle,   color: "text-orange-600" },
  medium: { label: "Mesatar", icon: MinusCircle,     color: "text-blue-600" },
  low:    { label: "Ulët",    icon: ArrowDownCircle, color: "text-slate-500" },
  none:   { label: "Pa",      icon: Circle,          color: "text-slate-400" },
};

const ENTITY_LABEL: Record<CreateTaskEntityType, string> = {
  booking: "Rezervim",
  agent: "Agjenci",
  flight: "Fluturim",
  group_ticket: "Grup",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

interface CreateTaskCtx {
  openCreateTask: (prefill?: CreateTaskPrefill) => void;
}
const Ctx = createContext<CreateTaskCtx | null>(null);

export function useCreateTask(): CreateTaskCtx {
  const v = useContext(Ctx);
  if (!v) return { openCreateTask: () => {} };
  return v;
}

export function CreateTaskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<CreateTaskPrefill | null>(null);

  const openCreateTask = useCallback((p?: CreateTaskPrefill) => {
    setPrefill(p ?? null);
    setOpen(true);
  }, []);

  // Cmd/Ctrl+K global shortcut to open without prefill.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const tgt = e.target as HTMLElement | null;
        if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
        e.preventDefault();
        openCreateTask();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [openCreateTask]);

  return (
    <Ctx.Provider value={{ openCreateTask }}>
      {children}
      <CreateTaskDialog open={open} onClose={() => setOpen(false)} prefill={prefill} />
    </Ctx.Provider>
  );
}

function CreateTaskDialog({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill: CreateTaskPrefill | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAdminAuth();

  const { data: users = [] } = useQuery<StaffUser[]>({
    queryKey: ["taskUsers"],
    queryFn: () => api<StaffUser[]>("/tasks-meta/users"),
    enabled: open,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDescription("");
      setPriority("medium");
      setAssigneeId(user?.id ? String(user.id) : "");
      setDueDate("");
      setLabels([]);
      setLabelInput("");
    }
  }, [open, prefill, user]);

  const mut = useMutation({
    mutationFn: () => api<any>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeId: assigneeId && assigneeId !== "0" ? Number(assigneeId) : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        labels,
        entityType: prefill?.entityType ?? null,
        entityId: prefill?.entityId ?? null,
      }),
    }),
    onSuccess: () => {
      toast({ title: "Detyra u krijua" });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasksStats"] });
      qc.invalidateQueries({ queryKey: ["tasks-entity-counts"] });
      qc.invalidateQueries({ queryKey: ["booking-linked-tasks"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Gabim", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Detyrë e re</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {prefill && (
            <div className="px-2.5 py-2 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 inline-flex items-center gap-2 max-w-full">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span>Lidhur me <strong>{ENTITY_LABEL[prefill.entityType]}</strong></span>
              {prefill.entityRef && (
                <span className="px-1.5 py-0.5 rounded bg-white border border-indigo-200 font-mono font-bold text-indigo-900">
                  {prefill.entityRef}
                </span>
              )}
              {prefill.entitySublabel && <span className="text-indigo-600 truncate">— {prefill.entitySublabel}</span>}
            </div>
          )}
          <Input
            autoFocus
            placeholder="Titulli i detyrës..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-base font-semibold"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && title.trim()) mut.mutate(); }}
          />
          <Textarea placeholder="Përshkrim (opsional)..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Prioriteti</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2"><m.icon className={cn("w-4 h-4", m.color)} />{m.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Caktuar</label>
              <Select value={assigneeId || "0"} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Pa caktuar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Pa caktuar</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Afati</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Labels</label>
              <Input
                placeholder="Shto label + Enter"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && labelInput.trim()) {
                    e.preventDefault();
                    if (!labels.includes(labelInput.trim())) setLabels([...labels, labelInput.trim()]);
                    setLabelInput("");
                  }
                }}
              />
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {labels.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                      {l}<button onClick={() => setLabels(labels.filter((x) => x !== l))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Anulo</Button>
          <Button onClick={() => mut.mutate()} disabled={!title.trim() || mut.isPending}>
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Krijo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
