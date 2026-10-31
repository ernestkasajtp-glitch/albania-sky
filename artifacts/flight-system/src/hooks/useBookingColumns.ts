import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBookingColumnPreferences, saveBookingColumnPreferences } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_BOOKING_COLUMNS, visibleBookingColumns, type BookingColumnId } from "@/lib/bookingColumns";

export function useBookingColumns(userId: number | undefined, canCommission: boolean) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ userId: number; columns: BookingColumnId[]; widths: Record<string, number> } | null>(null);
  const key = ["booking-columns", userId];
  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: ({ signal }) => getBookingColumnPreferences({ signal }),
    staleTime: 0,
  });
  const ownedDraft = draft?.userId === userId ? draft : null;
  const selected = ownedDraft?.columns ?? query.data?.visibleColumns ?? DEFAULT_BOOKING_COLUMNS;
  const widths = ownedDraft?.widths ?? query.data?.columnWidths ?? {};
  const columns = visibleBookingColumns(selected, canCommission);
  const shown = new Set<BookingColumnId>(columns.map(column => column.k));
  const mutation = useMutation({
    mutationFn: (variables: { owner: number; visibleColumns: BookingColumnId[] | null; columnWidths: Record<string, number> }) =>
      saveBookingColumnPreferences({ visibleColumns: variables.visibleColumns, columnWidths: variables.columnWidths }),
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: ["booking-columns", variables.owner] });
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["booking-columns", variables.owner], data);
      setDraft(current => current?.userId === variables.owner ? null : current);
      toast({ title: variables.visibleColumns === null ? "Pamja fillestare u rikthye" : "Pamja default u ruajt", description: "Vlen për llogarinë tënde në çdo pajisje." });
    },
    onError: () => toast({ title: "Pamja nuk u ruajt", description: "Zgjedhja jote mbetet këtu. Provo përsëri.", variant: "destructive" }),
  });
  const disabled = query.isPending || query.isError || mutation.isPending || !userId;
  const toggle = (id: BookingColumnId) => {
    if (disabled || (shown.has(id) && shown.size <= 1)) return;
    // Normalize a revoked-permission-only saved default to the visible safe fallback.
    const base = [...new Set([...selected, ...shown])];
    const next = shown.has(id) ? base.filter(column => column !== id) : [...base, id];
    setDraft({ userId: userId!, columns: next, widths });
  };
  return {
    columns, shown, toggle, disabled, widths,
    resize: (id: BookingColumnId, width: number) => {
      if (disabled || !shown.has(id) || !Number.isFinite(width)) return;
      setDraft({ userId: userId!, columns: [...selected], widths: { ...widths, [id]: Math.max(48, Math.min(1000, Math.round(width))) } });
    },
    loading: query.isPending,
    error: query.isError,
    retry: () => { void query.refetch(); },
    saving: mutation.isPending,
    dirty: !!ownedDraft,
    save: () => { if (!disabled) mutation.mutate({ owner: userId!, visibleColumns: [...new Set([...selected, ...shown])], columnWidths: widths }); },
    reset: () => { if (!disabled) mutation.mutate({ owner: userId!, visibleColumns: null, columnWidths: {} }); },
  };
}