import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

/**
 * Sortable column header for admin tables.
 *
 * Renders a <th> carrying the correct `aria-sort` value ("ascending" /
 * "descending" on the active column, absent otherwise) with a type="button"
 * sort trigger and an ↑/↓ indicator on the active column.
 *
 * The default button typography is the sentence-case column label shared by the
 * Claim Log / Atlassian tables; page-level deltas (padding, responsive
 * visibility, font size) ride `className` (the <th>) and `buttonClassName`
 * (the button) — both merged with tailwind-merge so overrides win.
 */
export function SortableHeader<Field extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className,
  buttonClassName,
}: {
  field: Field;
  label: string;
  /** Currently active sort field. */
  sortField: Field;
  /** Direction of the active sort. */
  sortDir: SortDirection;
  onSort: (field: Field) => void;
  /** Extra classes for the <th> (padding / visibility deltas). */
  className?: string;
  /** Extra classes for the sort button (typography deltas). */
  buttonClassName?: string;
}) {
  const active = sortField === field;
  return (
    <th
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('text-left', className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex select-none items-center text-[0.82rem] font-semibold text-muted-foreground transition-colors hover:text-foreground',
          buttonClassName
        )}
      >
        {label}
        {active && (
          <span className="ml-1" aria-hidden="true">
            {sortDir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    </th>
  );
}
