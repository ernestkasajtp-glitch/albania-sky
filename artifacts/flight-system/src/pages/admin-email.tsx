// ─────────────────────────────────────────────────────────────────────────────
// Email (vetëm admin) — inbox i brendshëm i adresës së dedikuar Gmail.
// Lista majtas, email-i i hapur djathtas (iframe i izoluar), përgjigje + email i ri.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, RefreshCw, Search, Send, Paperclip, Loader2, PenSquare, CornerUpLeft, ChevronDown, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API = "/api";

async function apiJson(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, {
    ...opts,
    credentials: "include",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || res.statusText);
  return data;
}

type MailItem = {
  uid: number;
  subject: string;
  from: { name: string; address: string } | null;
  date: string | null;
  seen: boolean;
  answered: boolean;
  hasAttachment: boolean;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const today = new Date();
    return d.toDateString() === today.toDateString() ? format(d, "HH:mm") : format(d, "dd.MM.yyyy HH:mm");
  } catch { return ""; }
}

export default function AdminEmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [pages, setPages] = useState<number[]>([]); // beforeUid stack
  const beforeUid = pages.length ? pages[pages.length - 1] : 0;
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeText, setComposeText] = useState("");
  const [replyFrom, setReplyFrom] = useState("");
  const [composeFrom, setComposeFrom] = useState("");
  const [mailbox, setMailbox] = useState("INBOX");
  const [unseenOnly, setUnseenOnly] = useState(false);

  const labelsQ = useQuery({
    queryKey: ["/api/admin-email/labels"],
    queryFn: () => apiJson(`/admin-email/labels`),
    staleTime: 10 * 60 * 1000,
  });

  // Vlera speciale në dropdown: INBOX = Inbox pa booking-et; __BOOKINGS__ = vetëm NEW BOOKING
  const realMailbox = mailbox === "__BOOKINGS__" ? "INBOX" : mailbox;
  const bookingsParam = mailbox === "INBOX" ? "&bookings=hide" : mailbox === "__BOOKINGS__" ? "&bookings=only" : "";
  const mbParam = `&mailbox=${encodeURIComponent(realMailbox)}${bookingsParam}`;
  const listQ = useQuery({
    queryKey: ["/api/admin-email/messages", activeSearch, beforeUid, mailbox, unseenOnly],
    queryFn: () => apiJson(`/admin-email/messages?limit=30${mbParam}${unseenOnly ? "&unseen=1" : ""}${beforeUid ? `&beforeUid=${beforeUid}` : ""}${activeSearch ? `&search=${encodeURIComponent(activeSearch)}` : ""}`),
    refetchInterval: 60000,
  });

  const detailQ = useQuery({
    queryKey: ["/api/admin-email/message", selectedUid, mailbox],
    queryFn: () => apiJson(`/admin-email/messages/${selectedUid}?mailbox=${encodeURIComponent(realMailbox)}`),
    enabled: selectedUid !== null,
  });

  const items: MailItem[] = listQ.data?.items ?? [];
  const detail = detailQ.data;

  const openMessage = (uid: number) => {
    setSelectedUid(uid);
    setReplyText("");
    setReplyFrom(""); // rikthehet te sugjerimi automatik i email-it të ri

    // shëno si të lexuar edhe në listë (optimiste)
    queryClient.setQueryData(["/api/admin-email/messages", activeSearch, beforeUid, mailbox, unseenOnly], (old: any) =>
      old ? { ...old, items: old.items.map((m: MailItem) => (m.uid === uid ? { ...m, seen: true } : m)) } : old,
    );
  };

  const sendReply = async () => {
    if (!selectedUid || !replyText.trim()) return;
    setSending(true);
    try {
      const r = await apiJson(`/admin-email/messages/${selectedUid}/reply?mailbox=${encodeURIComponent(realMailbox)}`, { method: "POST", body: JSON.stringify({ text: replyText.trim(), from: replyFrom || detail?.suggestedFrom || undefined }) });
      toast({ title: "Përgjigja u dërgua", description: `Te: ${r.to} · Nga: ${r.from}` });
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin-email/messages"] });
    } catch (e: any) {
      toast({ title: "Dërgimi dështoi", description: e?.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const sendCompose = async () => {
    setSending(true);
    try {
      await apiJson(`/admin-email/compose`, { method: "POST", body: JSON.stringify({ to: composeTo.trim(), subject: composeSubject.trim(), text: composeText.trim(), from: composeFrom || undefined }) });
      toast({ title: "Email-i u dërgua", description: `Te: ${composeTo.trim()}` });
      setComposeOpen(false);
      setComposeTo(""); setComposeSubject(""); setComposeText("");
    } catch (e: any) {
      toast({ title: "Dërgimi dështoi", description: e?.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const notConfigured = (listQ.error as any)?.message?.includes("konfiguruar");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Mail className="h-5 w-5" /> Email</h1>
          {listQ.data?.address && <p className="text-xs text-muted-foreground mt-0.5">{listQ.data.address} · {listQ.data.total} email gjithsej</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mailbox} onValueChange={v => { setMailbox(v); setPages([]); setSelectedUid(null); }}>
            <SelectTrigger className="w-44">
              <span className="flex items-center gap-1.5 truncate"><Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><SelectValue placeholder="Label" /></span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INBOX">Inbox (pa booking-et)</SelectItem>
              <SelectItem value="__BOOKINGS__">Albania Sky — NEW BOOKING</SelectItem>
              {(labelsQ.data?.labels ?? [])
                .filter((l: any) => l.path !== "INBOX")
                .map((l: any) => (
                  <SelectItem key={l.path} value={l.path}>{l.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant={unseenOnly ? "default" : "outline"}
            size="sm"
            onClick={() => { setUnseenOnly(v => !v); setPages([]); setSelectedUid(null); }}
          >
            Të palexuara
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setPages([]); setActiveSearch(search.trim()); } }}
              placeholder="Kërko (dërguesi ose subjekti)..."
              className="pl-8 w-64"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setPages([]); setActiveSearch(search.trim()); }}>Kërko</Button>
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/admin-email/messages"] }); }}>
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setComposeOpen(true)}><PenSquare className="h-4 w-4 mr-1.5" /> Email i ri</Button>
        </div>
      </div>

      {notConfigured && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Inbox-i s'është konfiguruar ende — duhet App Password-i i Gmail (ADMIN_INBOX_USER / ADMIN_INBOX_PASS në server).
        </div>
      )}
      {listQ.error && !notConfigured && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{(listQ.error as any)?.message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* Lista */}
        <div className="rounded-lg border overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Duke ngarkuar...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Asnjë email{activeSearch ? " për këtë kërkim" : ""}.</div>
          ) : (
            <div className="divide-y max-h-[70vh] overflow-auto">
              {items.map(m => (
                <button
                  key={m.uid}
                  onClick={() => openMessage(m.uid)}
                  className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60 ${selectedUid === m.uid ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${m.seen ? "text-muted-foreground" : "font-bold"}`}>
                      {m.from?.name || m.from?.address || "?"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(m.date)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {!m.seen && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                    {m.answered && <CornerUpLeft className="h-3 w-3 shrink-0 text-green-600" />}
                    {m.hasAttachment && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span className={`truncate text-xs ${m.seen ? "text-muted-foreground" : "font-semibold"}`}>{m.subject}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t px-3 py-2">
            <Button variant="ghost" size="sm" disabled={pages.length === 0} onClick={() => setPages(p => p.slice(0, -1))}>Më të rinj</Button>
            <Button variant="ghost" size="sm" disabled={!listQ.data?.nextBeforeUid} onClick={() => setPages(p => [...p, listQ.data.nextBeforeUid])}>
              Më të vjetër <ChevronDown className="h-4 w-4 ml-1 -rotate-90" />
            </Button>
          </div>
        </div>

        {/* Detaji */}
        <div className="rounded-lg border min-h-[60vh]">
          {selectedUid === null ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Zgjidh një email nga lista</div>
          ) : detailQ.isLoading ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Duke hapur...</div>
          ) : detailQ.error ? (
            <div className="p-4 text-sm text-red-700">{(detailQ.error as any)?.message}</div>
          ) : detail ? (
            <div className="flex flex-col">
              <div className="border-b px-4 py-3">
                <h2 className="font-semibold">{detail.subject}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{detail.from?.name || detail.from?.address}</strong>{detail.from?.name ? ` <${detail.from?.address}>` : ""}</span>
                  <span>{fmtDate(detail.date)}</span>
                </div>
                {detail.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detail.attachments.map((a: any) => (
                      <a
                        key={a.idx}
                        href={`${API}/admin-email/messages/${detail.uid}/attachments/${a.idx}?mailbox=${encodeURIComponent(realMailbox)}`}
                        className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Paperclip className="h-3 w-3" /> {a.filename}
                        <Badge variant="secondary" className="ml-1 text-[10px]">{Math.max(1, Math.round((a.size || 0) / 1024))} KB</Badge>
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 bg-white">
                {detail.html ? (
                  <iframe
                    title="email"
                    sandbox=""
                    srcDoc={detail.html}
                    className="h-[52vh] w-full border-0"
                  />
                ) : (
                  <pre className="h-[52vh] w-full overflow-auto whitespace-pre-wrap p-4 text-sm">{detail.text}</pre>
                )}
              </div>
              <div className="border-t px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5"><CornerUpLeft className="h-3.5 w-3.5" /> Përgjigju ({detail.replyTo?.address || detail.from?.address})</Label>
                  {detail.senders?.length > 1 && (
                    <Select value={replyFrom || detail.suggestedFrom || detail.senders[0]} onValueChange={setReplyFrom}>
                      <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="Dërgo nga..." /></SelectTrigger>
                      <SelectContent>
                        {detail.senders.map((sn: string) => <SelectItem key={sn} value={sn}>Nga: {sn}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Shkruaj përgjigjen këtu..."
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Dërgo përgjigjen
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Email i ri */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Email i ri</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            {(listQ.data?.senders?.length ?? 0) > 1 && (
              <div>
                <Label className="text-xs mb-1 block">Nga (adresa dërguese)</Label>
                <Select value={composeFrom || listQ.data.senders[0]} onValueChange={setComposeFrom}>
                  <SelectTrigger><SelectValue placeholder="Zgjidh adresën" /></SelectTrigger>
                  <SelectContent>
                    {listQ.data.senders.map((sn: string) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">Për (adresa) *</Label>
              <Input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="emri@shembull.com" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Subjekti *</Label>
              <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Teksti *</Label>
              <Textarea value={composeText} onChange={e => setComposeText(e.target.value)} rows={6} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComposeOpen(false)}>Anulo</Button>
              <Button onClick={sendCompose} disabled={sending || !composeTo.trim() || !composeSubject.trim() || !composeText.trim()}>
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Dërgo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
