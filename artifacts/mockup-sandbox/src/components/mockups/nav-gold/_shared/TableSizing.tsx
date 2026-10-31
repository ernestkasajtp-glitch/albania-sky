import { useLayoutEffect, useRef, useState } from "react";
import { BOOKING_FINANCIAL_WIDTHS, type SortKey } from "./data";

// Source hooks/useResizableBookingTable.ts; only import/type names rewritten.
export function useResizableBookingTable(widths: Record<string, number>, keys: SortKey[], rows: unknown) {
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

// Source components/BookingColumnResize.tsx, unchanged local DOM behavior.
export function BookingColumnResize({ label, disabled, onResize }: {
  label: string; disabled: boolean; onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const fit = (handle: HTMLElement) => {
    const th = handle.closest("th")!;
    const table = th.closest("table")!;
    const index = [...th.parentElement!.children].indexOf(th);
    const clone = table.cloneNode(true) as HTMLTableElement;
    clone.style.cssText = "position:fixed;left:-100000px;top:0;width:max-content;table-layout:auto;visibility:hidden";
    clone.querySelectorAll("[hidden]").forEach(node => node.remove());
    clone.querySelectorAll("colgroup").forEach(node => node.remove());
    clone.querySelectorAll<HTMLElement>("th,td").forEach(cell => {
      cell.style.width = ""; cell.style.minWidth = ""; cell.style.maxWidth = "";
      cell.style.overflow = "visible";
      cell.querySelectorAll<HTMLElement>("[data-column-content]").forEach(content => {
        content.style.width = "max-content"; content.style.maxWidth = "none"; content.style.overflow = "visible";
      });
    });
    document.body.appendChild(clone);
    const width = (clone.tHead!.rows[0].cells[index]).getBoundingClientRect().width;
    clone.remove();
    onResize(Math.ceil(width));
  };
  return <span role="separator" aria-orientation="vertical" aria-label={`Gjerësia: ${label}`}
    tabIndex={disabled ? -1 : 0}
    title="Tërhiq për gjerësi; dyklik për përshtatje me përmbajtjen"
    className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none border-r border-slate-300 hover:bg-blue-300/50 focus:bg-blue-300/50"
    onClick={event => event.stopPropagation()}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); if (!disabled) fit(event.currentTarget); }}
    onKeyDown={event => {
      if (disabled) return;
      if (event.key === "Enter") { event.preventDefault(); fit(event.currentTarget); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); event.stopPropagation();
        onResize(event.currentTarget.closest("th")!.getBoundingClientRect().width + (event.key === "ArrowRight" ? 8 : -8));
      }
    }}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag.current = { x: event.clientX, width: event.currentTarget.closest("th")!.getBoundingClientRect().width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current) onResize(drag.current.width + event.clientX - drag.current.x);
    }}
    onPointerUp={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
  />;
}
