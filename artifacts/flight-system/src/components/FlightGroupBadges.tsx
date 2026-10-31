import type { AgencyGroup } from "@/components/AgencyGroups";
import { groupInitials, matchingFlightGroups, type GroupFlight } from "@/lib/flightGroupMatches";

export function FlightGroupBadges({ flight, groups, isLoading, error }: {
  flight: GroupFlight;
  groups?: AgencyGroup[];
  isLoading: boolean;
  error: Error | null;
}) {
  if (error) return <span role="alert" className="text-xs text-red-600" title={error.message}>Grupet nuk u ngarkuan</span>;
  if (isLoading || !groups) return <span className="text-xs text-muted-foreground">Duke ngarkuar...</span>;
  const matching = matchingFlightGroups(flight, groups);
  if (!matching.length) return <span className="text-muted-foreground" title="Asnjë grup nuk përputhet">—</span>;
  return <span className="inline-flex flex-wrap gap-1.5">
    {matching.map(group => <span key={group.id} title={group.name}
      className="inline-flex items-center rounded-md border border-blue-300 bg-blue-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
      {groupInitials(group.name)}
    </span>)}
  </span>;
}