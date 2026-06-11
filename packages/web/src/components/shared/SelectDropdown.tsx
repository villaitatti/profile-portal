import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SelectDropdownProps {
  id?: string;
  options: SelectDropdownOption[];
  value: string;
  onSelect: (value: string, label: string) => void;
  placeholder: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
}

const EMPTY_VALUE = '__select_empty__';

export function SelectDropdown({
  id,
  options,
  value,
  onSelect,
  placeholder,
  disabled = false,
  allowEmpty = true,
  className,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
}: SelectDropdownProps) {
  const handleValueChange = (nextValue: string) => {
    if (nextValue === EMPTY_VALUE) {
      onSelect('', '');
      return;
    }

    const option = options.find((item) => item.value === nextValue);
    onSelect(nextValue, option?.label ?? nextValue);
  };

  return (
    <Select.Root value={value || undefined} onValueChange={handleValueChange} disabled={disabled}>
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        className={cn(
          'flex w-full items-center justify-between rounded-md border bg-background px-3.5 py-2.5 text-left text-[0.95rem]',
          'transition-colors hover:bg-accent/50',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
          'data-[placeholder]:text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon asChild>
          <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          align="start"
          className="z-50 max-h-64 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <Select.Viewport className="p-1">
            {allowEmpty && <SelectDropdownItem value={EMPTY_VALUE} label={placeholder} muted />}
            {options.map((option) => (
              <SelectDropdownItem
                key={option.value}
                value={option.value}
                label={option.label}
                sublabel={option.sublabel}
              />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function SelectDropdownItem({
  value,
  label,
  sublabel,
  muted = false,
}: {
  value: string;
  label: string;
  sublabel?: string;
  muted?: boolean;
}) {
  return (
    <Select.Item
      value={value}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-[0.95rem] outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        muted && 'text-muted-foreground'
      )}
    >
      <Select.ItemIndicator className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        <Check className="h-4 w-4" />
      </Select.ItemIndicator>
      <Select.ItemText>
        <span className="truncate">{label}</span>
      </Select.ItemText>
      {sublabel && (
        <span className="ml-auto truncate text-[0.78rem] text-muted-foreground">{sublabel}</span>
      )}
    </Select.Item>
  );
}
