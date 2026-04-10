import { useState, useRef } from 'react';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  displayValue?: string;
  onSelect: (value: string, label: string) => void;
  onClear?: () => void;
  placeholder: string;
  emptyMessage?: string;
  allowCreate?: boolean;
  onCreateNew?: (value: string) => void;
  disallowChars?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableCombobox({
  options,
  value,
  displayValue,
  onSelect,
  onClear,
  placeholder,
  emptyMessage = 'No options found.',
  allowCreate = false,
  onCreateNew,
  disallowChars,
  disabled = false,
  className,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const trimmedSearch = search.trim().toLowerCase();
  const hasExactMatch = trimmedSearch
    ? options.some((o) => o.label.trim().toLowerCase() === trimmedSearch)
    : true;
  const showCreateNew = allowCreate && trimmedSearch && !hasExactMatch;

  const handleSelect = (optionValue: string, optionLabel: string) => {
    onSelect(optionValue, optionLabel);
    setOpen(false);
    setSearch('');
  };

  const handleCreateNew = () => {
    if (onCreateNew && search.trim()) {
      onCreateNew(search.trim());
      setOpen(false);
      setSearch('');
    }
  };

  const handleClear = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    onClear?.();
    setSearch('');
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] text-left',
            'hover:bg-accent/50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        >
          <span className={cn(!selectedOption && !displayValue && 'text-muted-foreground')}>
            {selectedOption ? selectedOption.label : displayValue || placeholder}
          </span>
          <span className="flex items-center gap-1 ml-2 flex-shrink-0">
            {(selectedOption || displayValue) && onClear && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => { if (e.key === 'Enter') handleClear(e); }}
                className="p-0.5 rounded hover:bg-muted transition-colors"
                aria-label="Clear selection"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover shadow-md"
          sideOffset={4}
          align="start"
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Command.Input
                ref={inputRef}
                value={search}
                onValueChange={(val) => {
                  if (disallowChars) {
                    const regex = new RegExp(`[${disallowChars.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}]`, 'g');
                    setSearch(val.replace(regex, ''));
                  } else {
                    setSearch(val);
                  }
                }}
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                className="flex h-10 w-full bg-transparent py-2 text-[0.95rem] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto p-1">
              {options
                .filter((o) =>
                  !trimmedSearch || o.label.trim().toLowerCase().includes(trimmedSearch)
                )
                .map((option) => (
                  <Command.Item
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value, option.label)}
                    className="relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[0.95rem] outline-none hover:bg-accent aria-selected:bg-accent"
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        value === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="ml-auto truncate text-[0.78rem] text-muted-foreground">
                        {option.sublabel}
                      </span>
                    )}
                  </Command.Item>
                ))}

              {showCreateNew && (
                <Command.Item
                  value={`__create__${search.trim()}`}
                  onSelect={handleCreateNew}
                  className="relative mt-1 flex cursor-pointer items-center gap-2 rounded-md border-t px-2.5 pt-3 pb-2 text-[0.95rem] text-primary outline-none hover:bg-accent aria-selected:bg-accent"
                >
                  <Plus className="h-4 w-4 flex-shrink-0" />
                  <span>Create new: &ldquo;{search.trim()}&rdquo;</span>
                </Command.Item>
              )}

              {!showCreateNew &&
                trimmedSearch &&
                options.filter((o) => o.label.trim().toLowerCase().includes(trimmedSearch)).length === 0 && (
                  <div className="py-4 text-center text-[0.95rem] text-muted-foreground">
                    {emptyMessage}
                  </div>
                )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
