import { useTranslation } from 'react-i18next';
import { useState, useRef } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableComboboxProps {
  id?: string;
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
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
}

export function SearchableCombobox({
  id,
  options,
  value,
  displayValue,
  onSelect,
  onClear,
  placeholder,
  emptyMessage,
  allowCreate = false,
  onCreateNew,
  disallowChars,
  disabled = false,
  className,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
}: SearchableComboboxProps) {
  const { t } = useTranslation();
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

  const clearable = !!((selectedOption || displayValue) && onClear);

  return (
    <Popover open={open} onOpenChange={(isOpen) => setOpen(isOpen)}>
      {/* The clear control is a sibling of the trigger, not a child: a
          role="button" nested inside a <button> is invalid nested interactive
          content and unreachable for screen readers. */}
      <div className="relative w-full">
        <PopoverTrigger
          render={
            <button
              id={id}
              type="button"
              role="combobox"
              disabled={disabled}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              aria-required={ariaRequired}
              className={cn(
                'flex w-full items-center justify-between rounded-md border border-input bg-background px-3.5 py-2.5 text-[0.95rem] text-left',
                'hover:bg-accent/50 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                // Reserve room for the absolutely positioned clear button.
                clearable && 'pr-14',
                disabled && 'opacity-50 cursor-not-allowed',
                className
              )}
            />
          }
        >
          <span className={cn('min-w-0 truncate', !selectedOption && !displayValue && 'text-muted-foreground')}>
            {selectedOption ? selectedOption.label : displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </PopoverTrigger>

        {clearable && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label={t('common.clearSelection')}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <PopoverContent
        className="w-(--anchor-width) gap-0 rounded-md p-0"
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
              placeholder={t('common.searchIn', { target: placeholder.toLowerCase() })}
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
                <span>{t('common.createNew', { value: search.trim() })}</span>
              </Command.Item>
            )}

            {!showCreateNew &&
              trimmedSearch &&
              options.filter((o) => o.label.trim().toLowerCase().includes(trimmedSearch)).length === 0 && (
                <div className="py-4 text-center text-[0.95rem] text-muted-foreground">
                  {emptyMessage ?? t('common.noResults')}
                </div>
              )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
