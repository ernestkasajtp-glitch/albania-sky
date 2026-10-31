import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { BookingColumnResize } from "./BookingColumnResize";

export type FlightLayout = { order: string[]; widths: Record<string, number> };
export const initialFlightLayout: FlightLayout = { order: [], widths: {} };
const widths: Record<string, number> = {
  select: 36, route: 165, date: 228, flightNo: 140, seats: 176,
  price: 96, baggage: 116, google: 118, groups: 90, sales: 100,
  net: 100, commission: 112, actions: 172, newprice: 110, diff: 100,
};
export function FlightLayoutTable({ children, columns, layout, onChange }: {
  children: ReactNode; columns: string[]; layout: FlightLayout;
  onChange: (next: FlightLayout) => void;
}) {
  const ordered = [...columns].sort((a, b) => {
    if (a === "select") return -1;
    if (b === "select") return 1;
    if (a === "actions") return 1;
    if (b === "actions") return -1;
    const rank = (key: string) => layout.order.includes(key) ? layout.order.indexOf(key) : layout.order.length + columns.indexOf(key);
    return rank(a) - rank(b);
  });
  const width = (key: string) => Math.max(36, Math.min(900, layout.widths[key] || widths[key] || 110));
  const move = (source: string, target: string) => {
    if (!ordered.includes(source) || ["select", "actions"].includes(source) || ["select", "actions"].includes(target)) return;
    const next = ordered.filter(key => key !== source);
    next.splice(next.indexOf(target), 0, source);
    onChange({ ...layout, order: [...next, ...layout.order.filter(key => !next.includes(key))] });
  };
  const transform = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (!isValidElement<any>(node)) return node;
    if (node.type === "tr") {
      const cells = Children.toArray((node.props as any).children).filter(isValidElement<any>);
      // Loading, empty and expanded-detail rows are not column data.
      if (cells.length !== columns.length || cells.some(c => c.props.colSpan > 1)) return node;
      return cloneElement(node, {}, ordered.map(key => {
        const cell = cells[columns.indexOf(key)];
        const header = cell.type === "th";
        const movable = header && key !== "select" && key !== "actions";
        return cloneElement(cell, {
          key, style: { ...cell.props.style, width: width(key), maxWidth: width(key), position: "relative",
            paddingLeft: 8, paddingRight: 14, verticalAlign: "middle",
            textAlign: ["price", "google", "sales", "net", "commission", "newprice", "diff", "actions"].includes(key) ? "right" : "left",
            fontVariantNumeric: "tabular-nums" },
          "data-flight-column": key,
          ...(movable ? {
            onDragOver: (e: React.DragEvent) => e.preventDefault(),
            onDrop: (e: React.DragEvent) => { e.preventDefault(); move(e.dataTransfer.getData("text/flight-column"), key); },
          } : {}),
        }, <>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap" data-column-content
            onMouseEnter={e => { e.currentTarget.title = e.currentTarget.textContent || ""; }}>
            {movable && <span draggable title="Tërhiq për të zhvendosur kolonën" aria-label={`Zhvendos ${key}`}
              className="mr-1 cursor-grab text-muted-foreground select-none"
              onClick={e => e.stopPropagation()}
              onDragStart={e => { e.dataTransfer.setData("text/flight-column", key); e.dataTransfer.effectAllowed = "move"; }}>⠿</span>}
            {cell.props.children}
          </div>
          {header && key !== "select" && <BookingColumnResize label={key} disabled={false}
            onResize={value => onChange({ ...layout, widths: { ...layout.widths, [key]: Math.round(Math.max(52, Math.min(900, value))) } })} />}
        </>);
      }));
    }
    return cloneElement(node, {}, transform((node.props as any).children));
  });
  return <table className="text-sm table-fixed" style={{ width: ordered.reduce((sum, key) => sum + width(key), 0) }}>
    <colgroup>{ordered.map(key => <col key={key} style={{ width: width(key) }} />)}</colgroup>
    {transform(children)}
  </table>;
}