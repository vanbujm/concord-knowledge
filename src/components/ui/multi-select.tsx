"use client";

import { Check, ChevronDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FacetCount } from "@/retrieval/facets";

// A compact multi-select for a single facet: the trigger shows the facet label
// plus a count when anything is picked, and the popover holds a scrollable list
// of values (with their document counts) that toggle on click. Values are held
// by the caller, so this stays a controlled component.
export const MultiSelect = ({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: FacetCount[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const selectedSet = new Set(selected);

  const toggle = (value: string) => {
    const next = selectedSet.has(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];

    onChange(next);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected.length > 0 ? (
            <>
              <span className="truncate text-foreground">{label}</span>
              <Badge variant="secondary" className="h-4 px-1 tabular-nums">
                {selected.length}
              </Badge>
            </>
          ) : (
            <span className="truncate text-muted-foreground">{allLabel}</span>
          )}
        </span>

        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No options
            </p>
          ) : (
            options.map((option) => {
              const checked = selectedSet.has(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.value)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input",
                      checked &&
                        "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {checked ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : null}
                  </span>

                  <span className="flex-1 truncate text-left">
                    {option.value}
                  </span>

                  <span className="text-xs text-muted-foreground tabular-nums">
                    {option.count}
                  </span>
                </button>
              );
            })
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
