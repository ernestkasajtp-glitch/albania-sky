import {
  Children, cloneElement, createContext, isValidElement, useContext, useId, useState,
  type ComponentProps, type ReactElement, type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { Card as BaseCard, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const InsideSettingsCard = createContext(false);
type ChildProps = { children?: ReactNode; className?: string };

function findTitle(nodes: ReactNode): ReactElement<ChildProps> | undefined {
  for (const node of Children.toArray(nodes)) {
    if (!isValidElement<ChildProps>(node)) continue;
    if (node.type === CardTitle) return node;
    const title = findTitle(node.props.children);
    if (title) return title;
  }
  return undefined;
}

function withoutTitle(nodes: ReactNode): ReactNode {
  return Children.map(nodes, node => {
    if (!isValidElement<ChildProps>(node)) return node;
    if (node.type === CardTitle) return null;
    if (!node.props.children) return node;
    const children = withoutTitle(node.props.children);
    return Children.count(children) ? cloneElement(node, {}, children) : null;
  });
}

/** Settings-only disclosure; hidden content stays mounted to preserve unsaved edits.
 * No changes to the shared Card or to save/toggle/network behaviour.
 */
export function SettingsCard({ children, ...props }: ComponentProps<typeof BaseCard>) {
  const nested = useContext(InsideSettingsCard);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const nodes = Children.toArray(children);
  const header = nodes.find(node => isValidElement(node) && node.type === CardHeader) as ReactElement<ChildProps> | undefined;
  const title = header && findTitle(header.props.children);
  if (nested || !header || !title) return <BaseCard {...props}>{children}</BaseCard>;
  const headerExtras = withoutTitle(header.props.children);

  return (
    <InsideSettingsCard.Provider value>
      <BaseCard {...props} data-settings-category="">
        <div className="p-4">
          <button type="button" aria-expanded={expanded} aria-controls={id}
            data-settings-expand=""
            className="flex w-full items-center justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setExpanded(value => !value)}>
            <span className={cn("min-w-0 text-base font-semibold", title.props.className)}>{title.props.children}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {expanded ? "Mbyll" : "Zgjero"}
              <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            </span>
          </button>
        </div>
        <div id={id} style={expanded ? undefined : { display: "none" }}>
          {nodes.map(node => node === header
            ? (Children.count(headerExtras) > 0
              ? cloneElement(header, { className: cn(header.props.className, "pt-0") }, headerExtras)
              : null)
            : node)}
        </div>
      </BaseCard>
    </InsideSettingsCard.Provider>
  );
}
