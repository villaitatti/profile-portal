import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const handleValueChange = (nextValue: string | null) => {
    if (nextValue === null || nextValue === EMPTY_VALUE) {
      onSelect('', '');
      return;
    }

    const option = options.find((item) => item.value === nextValue);
    onSelect(nextValue, option?.label ?? nextValue);
  };

  return (
    <Select
      value={value || null}
      onValueChange={(nextValue) => handleValueChange(nextValue)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        className={cn('h-auto w-full px-3.5 py-2.5 text-[0.95rem]', className)}
      >
        <SelectValue placeholder={placeholder}>
          {(selected) =>
            options.find((item) => item.value === selected)?.label ?? placeholder
          }
        </SelectValue>
      </SelectTrigger>

      <SelectContent align="start" sideOffset={4} alignItemWithTrigger={false} className="max-h-64">
        {allowEmpty && (
          <SelectItem value={EMPTY_VALUE} className="text-muted-foreground">
            {placeholder}
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="truncate">{option.label}</span>
            {option.sublabel && (
              <span className="ml-auto truncate text-[0.78rem] text-muted-foreground">
                {option.sublabel}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
