import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethodOption = { value: string; label: string; color?: string };

/**
 * Metoda e pagesës me kërkim (search): dropdown me fushë kërkimi sipër,
 * përdoret kudo ku krijohet/modifikohet një pagesë.
 */
export function PaymentMethodCombobox({
  value,
  onChange,
  options,
  placeholder = "Zgjidh mënyrën e pagesës",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PaymentMethodOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opts = options;
  const selected = opts.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {selected ? (
            <span className="inline-flex items-center gap-2 truncate">
              {selected.color && (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
              )}
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Kërko metodën..." />
          <CommandList className="max-h-64">
            <CommandEmpty>Asnjë metodë nuk u gjet.</CommandEmpty>
            <CommandGroup>
              {opts.map(o => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    {o.color && (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                    )}
                    <span className="truncate">{o.label}</span>
                  </span>
                  {o.value === value && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
