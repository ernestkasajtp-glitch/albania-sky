import { useLayoutEffect, useRef, useState } from "react";
import { BOOKING_FINANCIAL_WIDTHS, type BookingColumnId } from "@/lib/bookingColumns";

export function useResizableBookingTable(widths: Record<string, number>, keys: BookingColumnId[], rows: unknown) {
  const ref = useRef<HTMLTableElement>(null);
  const [natural, setNatural] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    if (!ref.current) return;
    const clone = ref.current.cloneNode(true) as HTMLTableElement;
    clone.style.cssText = "position:fixed;left:-100000px;top:0;width:max-content;table-layout:auto;visibility:hidden";
    clone.querySelectorAll("colgroup").forEach(node => node.remove());
    clone.querySelectorAll<HTMLTableCellElement>("thead th").forEach((cell, i) => {
      const width = BOOKING_FINANCIAL_WIDTHS[keys[i]];
      cell.style.width = width ? `${width}px` : "";
      cell.style.minWidth = width ? `${width}px` : "";
      cell.style.maxWidth = "";
    });
    document.body.appendChild(clone);
    const next: Record<string, number> = {};
    keys.forEach((key, index) => {
      next[key] = BOOKING_FINANCIAL_WIDTHS[key] ?? Math.ceil(clone.tHead!.rows[0].cells[index].getBoundingClientRect().width);
    });
    clone.remove();
    // Loading queries can supply a fresh empty rows array on each render.
    // Measuring again must not schedule another render for identical geometry.
    setNatural(previous =>
      Object.keys(previous).length === Object.keys(next).length &&
      Object.keys(next).every(key => previous[key] === next[key])
        ? previous
        : next,
    );
  }, [keys.join(","), rows]);
  const sizes = keys.every(key => natural[key]) ? Object.fromEntries(keys.map(key => [key, widths[key] ?? natural[key]])) : null;
  return { ref, sizes };
}