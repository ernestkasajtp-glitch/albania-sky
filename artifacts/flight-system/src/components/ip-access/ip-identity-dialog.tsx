import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { sq } from "date-fns/locale";
import { Loader2, Monitor, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface KnownDevice {
  deviceId: string;
  label: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  loginCount: number;
}

export interface IpIdentity {
  ip: string;
  label: string | null;
  loginCount: number;
  devices: KnownDevice[];
}

export function browserDescription(userAgent: string | null): string {
  if (!userAgent) return "Shfletues i papërcaktuar";
  const system = /iPhone/i.test(userAgent) ? "iPhone"
    : /iPad/i.test(userAgent) ? "iPad"
    : /Android/i.test(userAgent) ? "Android"
    : /Windows/i.test(userAgent) ? "Windows"
    : /Mac OS X/i.test(userAgent) ? "macOS"
    : /Linux/i.test(userAgent) ? "Linux" : "Sistem i panjohur";
  const browser = /Edg\//i.test(userAgent) ? "Edge"
    : /Firefox\//i.test(userAgent) ? "Firefox"
    : /Chrome\//i.test(userAgent) ? "Chrome"
    : /Safari\//i.test(userAgent) ? "Safari" : "Shfletues i panjohur";
  return `${system} · ${browser}`;
}

function relativeDate(value: string): string {
  try { return formatDistanceToNow(new Date(value), { addSuffix: true, locale: sq }); }
  catch { return ""; }
}

export function IpIdentityDialog({
  record,
  onClose,
  onRenameIp,
  onRenameDevice,
}: {
  record: IpIdentity;
  onClose: () => void;
  onRenameIp: (ip: string, label: string) => Promise<boolean>;
  onRenameDevice: (deviceId: string, label: string) => Promise<boolean>;
}) {
  const [ipName, setIpName] = useState(record.label ?? "");
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const unidentifiedCount = Math.max(0, record.loginCount -
    record.devices.reduce((sum, device) => sum + device.loginCount, 0));

  const saveIp = async () => {
    setSaving("ip");
    try { await onRenameIp(record.ip, ipName); }
    finally { setSaving(null); }
  };
  const saveDevice = async (device: KnownDevice) => {
    setSaving(device.deviceId);
    try { await onRenameDevice(device.deviceId, deviceNames[device.deviceId] ?? device.label ?? ""); }
    finally { setSaving(null); }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Emrat e IP-së dhe shfletuesve</DialogTitle>
          <DialogDescription>{record.ip} · Emrat shërbejnë vetëm për identifikim vizual, jo për autorizim.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="ip-friendly-name" className="text-sm font-medium">Emri i IP-së</label>
            <div className="mt-1 flex gap-2">
              <Input id="ip-friendly-name" maxLength={60} value={ipName} onChange={e => setIpName(e.target.value)} placeholder="p.sh. Interneti i zyrës" />
              <Button size="sm" disabled={saving !== null || ipName.trim() === (record.label ?? "")} onClick={saveIp}>
                {saving === "ip" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ruaj"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Lëre bosh dhe ruaje për të hequr emrin e IP-së.</p>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto">
            <h3 className="text-sm font-semibold">Shfletuesit e njohur ({record.devices.length})</h3>
            {record.devices.length === 0 && <p className="text-sm text-gray-500">Ende nuk është identifikuar ndonjë shfletues nga kjo IP. Do të shfaqet pas hyrjes ose rifreskimit të faqes.</p>}
            {record.devices.map(device => (
              <div key={device.deviceId} className="rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{device.label || browserDescription(device.userAgent)}</p>
                    <p className="text-xs text-gray-500">
                      {browserDescription(device.userAgent)} · ID …{device.deviceId.slice(-8)} · {device.loginCount} hyrje · {relativeDate(device.lastSeenAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Input aria-label={`Emri për ${browserDescription(device.userAgent)}, ID ${device.deviceId.slice(-8)}`} maxLength={60}
                    value={deviceNames[device.deviceId] ?? device.label ?? ""}
                    onChange={e => setDeviceNames(previous => ({ ...previous, [device.deviceId]: e.target.value }))}
                    placeholder="p.sh. Laptopi i zyrës" />
                  <Button size="sm" variant="outline" disabled={saving !== null || (deviceNames[device.deviceId] ?? device.label ?? "").trim() === (device.label ?? "")} onClick={() => saveDevice(device)}>
                    {saving === device.deviceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    <span className="sr-only">Ruaj emrin e shfletuesit</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {unidentifiedCount > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              {unidentifiedCount} hyrje të vjetra nuk mund të lidhen me siguri me një shfletues.
            </p>
          )}
          <p className="text-xs text-gray-500">ID-ja i përket profilit të shfletuesit, jo pajisjes fizike. Një shfletues tjetër ose fshirja e të dhënave të tij krijon ID të re.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}