import type { SortField, SortDir } from './types';

// Module-scope so it doesn't re-create on every FellowsTable render; takes
// sort state as props. Keeps the arrow-indicator + aria-sort logic in one place.
export function SortHeader({
  field,
  label,
  className,
  sortField,
  sortDir,
  toggleSort,
}: {
  field: SortField;
  label: string;
  className?: string;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (f: SortField) => void;
}) {
  const ariaSort =
    sortField !== field ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending';
  return (
    <th
      aria-sort={ariaSort}
      className={`px-3 py-3 text-left ${className || ''}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="inline-flex select-none items-center text-[0.75rem] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {sortField === field && (
          <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
    </th>
  );
}
