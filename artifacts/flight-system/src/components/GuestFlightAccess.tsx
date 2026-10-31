import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetGuestFlightAccessQueryKey, useGetGuestFlightAccess, useSaveGuestFlightAccess, type GuestFlightPolicy } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsCard as Card } from "@/components/settings/SettingsCard";
import { useAgencyGroups } from "@/components/AgencyGroups";

export function GuestFlightAccess() {
  const query = useGetGuestFlightAccess({ query: { queryKey: getGetGuestFlightAccessQueryKey(), staleTime: 0 } });
  const groups = useAgencyGroups();
  const cache = useQueryClient();
  const save = useSaveGuestFlightAccess();
  const [draft, setDraft] = useState<GuestFlightPolicy | null>(null);
  const [saved, setSaved] = useState(false);
  const policy = draft ?? query.data;
  const change = (next: GuestFlightPolicy) => { setDraft(next); setSaved(false); save.reset(); };
  return <Card id="guest-flight-access">
    <CardHeader><CardTitle>Aksesi i vizitorëve</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Cakto një nga grupet ekzistuese për vizitorët e paloguar. Ata përdorin rregullat e atij grupi; përdoruesit e loguar dhe API-ja e partnerëve nuk ndryshojnë.</p>
      {query.isPending && <p>Po ngarkohet...</p>}
      {query.error && <p role="alert" className="text-red-600">Politika nuk u ngarkua: {query.error.message}</p>}
      {policy && <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        try {
          const result = await save.mutateAsync({ data: policy });
          cache.setQueryData(getGetGuestFlightAccessQueryKey(), result);
          setDraft(null); setSaved(true);
        } catch { /* Mutation error is rendered below. */ }
      }}>
        <fieldset disabled={save.isPending || groups.isPending || !!groups.error} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="guest-agency-group" className="text-sm font-medium">Grupi i vizitorëve të paloguar</label>
            <select id="guest-agency-group" className="block w-full rounded-md border bg-background p-2 text-sm"
              onFocus={() => { void groups.refetch(); }}
              value={policy.groupId ?? ""} onChange={event => change({ groupId: event.target.value ? Number(event.target.value) : null })}>
              <option value="">{groups.isPending ? "Po ngarkohen grupet..." : "Pa grup — asnjë fluturim"}</option>
              {policy.groupId != null && groups.data && !groups.data.some(group => group.id === policy.groupId) &&
                <option value={policy.groupId} disabled>Grupi nuk ekziston më — asnjë fluturim</option>}
              {groups.data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">Lista përfshin të gjitha grupet ekzistuese dhe rifreskohet kur hapni zgjedhjen, për të përfshirë edhe grupet e reja.</p>
          <p className="text-sm text-muted-foreground">Pa grup nuk lejohet asnjë fluturim, as përmes lidhjes direkte. Me grup shfaqen vetëm fluturimet e lejuara nga rregullat e grupit dhe të aktivizuara për Booking Engine.</p>
          {policy.groupId == null && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Pa grup: vizitorët nuk shohin asnjë fluturim{draft ? " pas ruajtjes" : ""}.</p>}
          {policy.groupId != null && groups.data?.find(group => group.id === policy.groupId)?.rules.length === 0 &&
            <p role="status" className="text-sm text-amber-700">Ky grup nuk ka rregulla; vizitorët nuk do të shohin asnjë fluturim.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!draft || !!query.error}>{save.isPending ? "Duke ruajtur..." : "Ruaj aksesin e vizitorëve"}</Button>
            {draft && <Button type="button" variant="ghost" onClick={() => { setDraft(null); save.reset(); }}>Anulo ndryshimet</Button>}
          </div>
        </fieldset>
        {groups.error && <p role="alert" className="text-red-600">Grupet nuk u ngarkuan: {groups.error.message}</p>}
        {save.error && <p role="alert" className="text-red-600">{save.error.message}</p>}
        {saved && <p role="status" className="text-green-700">Aksesi i vizitorëve u ruajt.</p>}
      </form>}
    </CardContent>
  </Card>;
}