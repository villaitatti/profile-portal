import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, Inbox, Landmark } from 'lucide-react';
import { useFormInvitations, useFormResponse, useFormRegistry } from '@/api/forms';
import { useDownloadFormPdf } from '@/hooks/useDownloadFormPdf';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormsSectionNav } from '@/pages/admin/components/FormsSectionNav';
import { getVisibleSections, isRetiredFormTitle } from '@/lib/form-render';
import { cn } from '@/lib/utils';
import type { AdminFormInvitation } from '@/api/forms';
import type { FormDef } from '@itatti/shared';

// ┌───────────────────────────────────────────────────────────────────────────┐
// │ Submissions archive: master-detail over form_invitations (status=submitted) │
// │                                                                            │
// │  ?year=&formType=&q=&invitation=  ──▶ filter + select state                │
// │                                       │                                    │
// │                                       ▼                                    │
// │   useFormInvitations({ status: 'submitted' })                              │
// │     └─ server returns { items, facets }                                    │
// │          │                                                                 │
// │          ▼                                                                 │
// │   Client filter (year, formType, debounced search)                         │
// │          │                                                                 │
// │          ▼                                                                 │
// │   List pane (roving tabindex, ul/li)  ◀──▶  Detail pane (getVisibleSections)│
// │          │                                         │                       │
// │          │                                         ▼                       │
// │          └── [PDF kind] ───────────▶  useDownloadFormPdf (bearer blob)     │
// │                                                                            │
// │  Special states:                                                           │
// │   - contactName === null   → render "Contact #<id>" (CiviCRM-down)         │
// │   - isRetiredFormTitle     → disable Download PDF + retired-form message   │
// └────────────────────────────────────────────────────────────────────────────┘

const SEARCH_DEBOUNCE_MS = 250;

export function FormsSubmissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Raw filter state — URL is the source of truth; search state carries a
  // debounced copy so typing doesn't thrash history.
  const yearParam = searchParams.get('year') ?? '';
  const formTypeParam = searchParams.get('formType') ?? '';
  const invitationParam = searchParams.get('invitation');
  const qParam = searchParams.get('q') ?? '';

  const [searchDraft, setSearchDraft] = useState(qParam);
  useEffect(() => {
    setSearchDraft(qParam);
  }, [qParam]);

  // Flush the search draft to the URL after a quiet period.
  useEffect(() => {
    if (searchDraft === qParam) return;
    const id = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchDraft) next.set('q', searchDraft);
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchDraft, qParam, setSearchParams]);

  const { data, isLoading, isError, refetch } = useFormInvitations({
    status: 'submitted',
  });

  const items = data?.items ?? [];
  const facets = data?.facets ?? { academicYears: [], formTypes: [] };

  // Default year resolution:
  //   - Explicit ?year=X wins outright.
  //   - Otherwise, if ?invitation=<id> resolves to a known item, we pin the
  //     default to that item's academic year so the deep-linked row is
  //     visible. Without this, the default-year rule can filter out the
  //     very row the user deep-linked to.
  //   - Otherwise, year of the most recent submitted invitation.
  const defaultYear = useMemo(() => {
    if (invitationParam) {
      const target = items.find((i) => i.id === invitationParam);
      if (target) return target.academicYear;
    }
    if (items.length === 0) return '';
    return items[0].academicYear; // items are sorted submittedAt DESC
  }, [items, invitationParam]);

  const effectiveYear = yearParam || defaultYear;

  // Apply filters client-side. Academic year + form type are exact matches;
  // search is a substring match on contactName/formTitle.
  const filteredItems = useMemo(() => {
    const needle = qParam.trim().toLowerCase();
    return items.filter((inv) => {
      if (effectiveYear && inv.academicYear !== effectiveYear) return false;
      if (formTypeParam && inv.formType !== formTypeParam) return false;
      if (needle) {
        const hay = `${inv.contactName ?? ''} ${inv.formTitle}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, effectiveYear, formTypeParam, qParam]);

  // Selection resolution:
  //   1. If ?invitation=<id> matches a row in the current filtered set, use it.
  //   2. Else auto-select the first filtered row (or null when empty).
  //   3. When the selected row falls out of the filtered set, clear ?invitation.
  const selectedId = useMemo(() => {
    if (invitationParam && filteredItems.some((i) => i.id === invitationParam)) {
      return invitationParam;
    }
    return filteredItems[0]?.id ?? null;
  }, [invitationParam, filteredItems]);

  useEffect(() => {
    if (
      invitationParam &&
      filteredItems.length > 0 &&
      !filteredItems.some((i) => i.id === invitationParam)
    ) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('invitation');
          return next;
        },
        { replace: true }
      );
    }
  }, [invitationParam, filteredItems, setSearchParams]);

  const setYear = useCallback(
    (year: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (year) next.set('year', year);
          else next.delete('year');
          next.delete('invitation'); // selection resolves from filtered list
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setFormType = useCallback(
    (formType: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (formType) next.set('formType', formType);
          else next.delete('formType');
          next.delete('invitation');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectInvitation = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('invitation', id);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selected = filteredItems.find((i) => i.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Review submitted appointee forms and inspect the templates used during nomination."
      />
      <FormsSectionNav />

      <div className="mt-6 space-y-6">
        <FilterBar
          year={effectiveYear}
          yearOptions={facets.academicYears}
          onYearChange={setYear}
          formType={formTypeParam}
          formTypeOptions={facets.formTypes}
          formTitlesByType={formTitlesByType(items)}
          onFormTypeChange={setFormType}
          search={searchDraft}
          onSearchChange={setSearchDraft}
        />

        {isError ? (
          <ErrorBanner onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12 mb-4" />}
            title="No submissions yet"
            description="Once appointees start submitting nomination forms, they will appear here."
          />
        ) : (
          <>
            {/* Announce filter-result count changes to assistive tech (WCAG 4.1.3).
                Keeping this visually hidden avoids visual duplication of the list. */}
            <div role="status" aria-live="polite" className="sr-only">
              {filterSummary(filteredItems.length, items.length)}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
              <SubmissionList
                items={filteredItems}
                selectedId={selectedId}
                onSelect={selectInvitation}
              />
              <DetailPane invitation={selected} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Filter bar
// ──────────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  year: string;
  yearOptions: string[];
  onYearChange: (v: string) => void;
  formType: string;
  formTypeOptions: string[];
  /**
   * Map of formType id → display title, sourced from the server's list
   * response. This keeps retired-form types rendering as
   * "(retired form: <id>)" in the dropdown instead of falling back to the
   * raw id when the registry no longer knows about them.
   */
  formTitlesByType: Map<string, string>;
  onFormTypeChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

function FilterBar({
  year,
  yearOptions,
  onYearChange,
  formType,
  formTypeOptions,
  formTitlesByType,
  onFormTypeChange,
  search,
  onSearchChange,
}: FilterBarProps) {
  const formTitleFor = (id: string): string => formTitlesByType.get(id) ?? id;
  // Explicit id/htmlFor pairs so the labels remain associated with the inputs
  // even if the JSX structure later changes and the implicit wrap is lost.
  const uid = useId();
  const yearId = `${uid}-year`;
  const formTypeId = `${uid}-formtype`;
  const searchId = `${uid}-search`;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={yearId} className="text-muted-foreground">
          Academic year
        </label>
        <select
          id={yearId}
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
          className="h-10 rounded border bg-background px-2 text-sm"
        >
          <option value="">All years</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={formTypeId} className="text-muted-foreground">
          Form
        </label>
        <select
          id={formTypeId}
          value={formType}
          onChange={(e) => onFormTypeChange(e.target.value)}
          className="h-10 rounded border bg-background px-2 text-sm"
        >
          <option value="">All forms</option>
          {formTypeOptions.map((t) => (
            <option key={t} value={t}>
              {formTitleFor(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1 text-sm flex-1 min-w-[200px]">
        <label htmlFor={searchId} className="text-muted-foreground">
          Search
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Name or form title"
          className="h-10 rounded border bg-background px-2 text-sm"
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// List pane
// ──────────────────────────────────────────────────────────────────────────

interface SubmissionListProps {
  items: AdminFormInvitation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function SubmissionList({ items, selectedId, onSelect }: SubmissionListProps) {
  // Roving-tabindex pattern: only the currently-selected row has tabIndex=0.
  // Arrow keys move selection AND roving focus WITHIN the list; Enter (or
  // click) activates and moves page focus to the detail pane heading.
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, id: string, index: number) => {
    // Only act on keypresses targeting the row itself. Without this guard,
    // a keyboard user focusing the nested PDF button and pressing Enter or
    // Space would fire both the button's native click (download) AND this
    // handler's activation path (select row + move focus to detail), which
    // would hijack focus mid-download.
    if (e.target !== e.currentTarget) return;
    let targetIndex = -1;
    switch (e.key) {
      case 'ArrowDown':
        targetIndex = Math.min(items.length - 1, index + 1);
        break;
      case 'ArrowUp':
        targetIndex = Math.max(0, index - 1);
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = items.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(id);
        // Move focus to the detail pane heading on activation only.
        const heading = document.getElementById('submission-detail-heading');
        heading?.focus();
        return;
      default:
        return;
    }
    if (targetIndex >= 0 && targetIndex !== index) {
      e.preventDefault();
      const target = items[targetIndex];
      onSelect(target.id);
      // Keep focus in the list — do NOT jump to detail. Focus the new row.
      const row = listRef.current?.querySelector<HTMLLIElement>(
        `[data-invitation-id="${target.id}"]`
      );
      row?.focus();
    }
  };

  if (items.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground"
      >
        No submissions match these filters.
      </div>
    );
  }

  return (
    // role="listbox" + role="option" on each row makes aria-selected semantically
    // valid (plain <li> does not support aria-selected per WAI-ARIA 1.2). The
    // nested [↓ PDF] button is a pragmatic deviation from the strict "only
    // checkbox/radio/switch descendants in option" rule — the business case for
    // a 1-click PDF action per row (OV1 decision) outweighs the ARIA purity
    // cost, and major screen readers (VoiceOver, NVDA) handle it without
    // announcing spurious state. If this surfaces as a real accessibility
    // complaint, move the PDF action to a row-level action menu.
    <ul
      ref={listRef}
      role="listbox"
      className="space-y-2 rounded-lg border bg-card p-2"
      aria-label="Form submissions"
    >
      {items.map((inv, index) => (
        <li
          key={inv.id}
          role="option"
          data-invitation-id={inv.id}
          tabIndex={inv.id === selectedId ? 0 : -1}
          aria-selected={inv.id === selectedId}
          onClick={() => onSelect(inv.id)}
          onKeyDown={(e) => handleKeyDown(e, inv.id, index)}
          className={cn(
            'cursor-pointer rounded-md border border-transparent p-3 outline-none transition',
            'hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary',
            inv.id === selectedId && 'border-primary/40 bg-accent'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">
                {displayName(inv)}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {inv.formTitle}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {inv.submittedAt
                  ? `${formatSubmittedDate(inv.submittedAt)} · ${inv.academicYear}`
                  : inv.academicYear}
              </div>
            </div>
            <PdfButtons invitation={inv} variant="icon" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Detail pane
// ──────────────────────────────────────────────────────────────────────────

function DetailPane({ invitation }: { invitation: AdminFormInvitation | null }) {
  const { data: registry } = useFormRegistry();
  const { data: response, isLoading, isError } = useFormResponse(invitation?.id ?? null);

  if (!invitation) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a submission to view the response.
      </div>
    );
  }

  const retired = isRetiredFormTitle(invitation.formTitle);
  const formDef: FormDef | undefined = registry?.find((f) => f.id === invitation.formType);

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="submission-detail-heading"
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {invitation.formTitle}
          </h2>
          <div className="text-sm text-muted-foreground mt-1">
            {displayName(invitation)} · {invitation.academicYear}
          </div>
          {invitation.submittedAt && (
            <div className="text-xs text-muted-foreground mt-1">
              Submitted {formatSubmittedDate(invitation.submittedAt)}
            </div>
          )}
        </div>
        <PdfButtons invitation={invitation} variant="button" />
      </div>

      {retired ? (
        <div
          role="status"
          className="rounded-md border border-warning-border bg-warning p-4 text-sm text-warning-foreground"
        >
          This form is no longer in the registry. The PDF cannot be regenerated.
        </div>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : isError || !response ? (
        <div className="text-sm text-destructive">
          Could not load response data.
        </div>
      ) : !formDef ? (
        <div className="text-sm text-muted-foreground">
          Form definition missing — cannot render fields.
        </div>
      ) : (
        <DetailFields
          formDef={formDef}
          data={response.data as Record<string, unknown>}
        />
      )}
    </div>
  );
}

function DetailFields({
  formDef,
  data,
}: {
  formDef: FormDef;
  data: Record<string, unknown>;
}) {
  const sections = getVisibleSections(formDef, data);

  if (sections.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        This response has no visible fields.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-foreground mb-4 pb-2 border-b border-border/60">
            {section.title}
          </h3>
          <dl className="space-y-4">
            {section.fields.map((f) => (
              <div key={f.name}>
                <dt className="text-xs text-muted-foreground mb-0.5">{f.label}</dt>
                <dd className="text-base leading-6 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PDF button
// ──────────────────────────────────────────────────────────────────────────

const PDF_DOWNLOADS = [
  { kind: 'memorandum' as const, label: 'Memorandum', icon: FileText },
  { kind: 'grants-resources' as const, label: 'Grants & Resources', icon: Landmark },
];

function PdfButtons({
  invitation,
  variant,
}: {
  invitation: AdminFormInvitation;
  variant: 'icon' | 'button';
}) {
  const download = useDownloadFormPdf();
  const retired = isRetiredFormTitle(invitation.formTitle);

  if (variant === 'icon') {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {PDF_DOWNLOADS.map((pdf) => {
          const Icon = pdf.icon;
          return (
            <button
              key={pdf.kind}
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // clicking PDF in a list row must NOT select the row
                if (retired) return;
                void download({
                  invitationId: invitation.id,
                  pdfKind: pdf.kind,
                  pdfLabel: pdf.label,
                  contactName: invitation.contactName,
                  formTitle: invitation.formTitle,
                });
              }}
              disabled={retired}
              aria-label={`Download ${pdf.label} PDF for ${displayName(invitation)}, ${invitation.formTitle}`}
              title={retired ? 'PDF unavailable for retired forms' : `Download ${pdf.label} PDF`}
              className={cn(
                // p-2 gives 32px on fine pointers; pointer-coarse:p-4 bumps to 48px
                // so touch users clear WCAG 2.5.5 Target Size (AAA) without
                // affecting desktop density. Icon itself is 16px.
                'shrink-0 rounded p-2 pointer-coarse:p-4 text-muted-foreground hover:bg-accent-foreground/10 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                retired && 'cursor-not-allowed opacity-40'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      {PDF_DOWNLOADS.map((pdf) => (
        <button
          key={pdf.kind}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (retired) return;
            void download({
              invitationId: invitation.id,
              pdfKind: pdf.kind,
              pdfLabel: pdf.label,
              contactName: invitation.contactName,
              formTitle: invitation.formTitle,
            });
          }}
          disabled={retired}
          aria-label={`Download ${pdf.label} PDF for ${displayName(invitation)}, ${invitation.formTitle}`}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            retired && 'cursor-not-allowed opacity-50'
          )}
        >
          <Download className="h-4 w-4" />
          {pdf.label} PDF
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function displayName(inv: AdminFormInvitation): string {
  // CiviCRM-down graceful degrade: when contactName could not be resolved
  // server-side, fall back to the stable contact id so the UI stays usable.
  return inv.contactName ?? `Contact #${inv.contactId}`;
}

/**
 * Build Map<formType, formTitle> from the server's items. The server already
 * computed formTitle for each invitation (including the "(retired form: ...)"
 * fallback for formTypes no longer in the registry), so deriving from items
 * keeps the FilterBar dropdown truthful for retired forms without needing a
 * second lookup against FORM_REGISTRY. Missing items fall through to `id`.
 */
function formTitlesByType(items: AdminFormInvitation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const inv of items) {
    if (!map.has(inv.formType)) map.set(inv.formType, inv.formTitle);
  }
  return map;
}

function formatSubmittedDate(iso: string): string {
  // submittedAt is an ISO datetime (not a YYYY-MM-DD string), so we use the
  // existing Intl formatter. Matches the v0.13.3 "24 Apr 2026" convention.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Skeletons + errors
// ──────────────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
      <ul className="space-y-2 rounded-lg border bg-card p-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="rounded-md p-3">
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-muted rounded mt-2 animate-pulse" />
            <div className="h-3 w-1/3 bg-muted rounded mt-2 animate-pulse" />
          </li>
        ))}
      </ul>
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        <FileText className="inline h-4 w-4 mr-2" /> Loading submissions…
      </div>
    </div>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm"
    >
      <div className="font-medium text-destructive mb-1">Could not load submissions.</div>
      <button
        type="button"
        onClick={onRetry}
        className="underline hover:no-underline text-destructive"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * Build a screen-reader-friendly string describing the current filter result.
 * Kept terse so it doesn't overwhelm assistive tech during rapid filter
 * changes (e.g., as the user types in the search box).
 */
function filterSummary(filtered: number, total: number): string {
  if (filtered === total) {
    return `Showing all ${total} submission${total === 1 ? '' : 's'}.`;
  }
  return `Showing ${filtered} of ${total} submission${total === 1 ? '' : 's'}.`;
}
