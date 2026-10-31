import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAgentRanks } from "@/hooks/useAgentRanks";

/**
 * Badge rendor renditë e agjentit sipas shitjeve totale (top 20).
 * Shfaqet VETËM për admin. Nëse agjenti nuk është në top 20, nuk shfaqet asgjë.
 */
export function AgentRankBadge({
  agentName,
  className = "",
}: {
  agentName: string | null | undefined;
  className?: string;
}) {
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const ranks = useAgentRanks();

  if (!isAdmin || !agentName) return null;
  const rank = ranks.get(agentName);
  if (!rank) return null;

  // Stilet sipas vendit
  const style =
    rank === 1
      ? "bg-yellow-400 text-yellow-900 ring-yellow-300"
      : rank === 2
      ? "bg-slate-300 text-slate-800 ring-slate-200"
      : rank === 3
      ? "bg-amber-600 text-white ring-amber-500"
      : rank <= 10
      ? "bg-indigo-600 text-white ring-indigo-400"
      : "bg-slate-500 text-white ring-slate-400";

  return (
    <span
      title={`Agjenti #${rank} sipas shitjeve totale`}
      className={`inline-flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-1.5 py-[2px] ring-1 shrink-0 ${style} ${className}`}
    >
      #{rank}
    </span>
  );
}
