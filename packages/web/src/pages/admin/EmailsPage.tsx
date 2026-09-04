import { useState, useMemo, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useEmailEvents, useEmailEventPreview, useTemplatePreview } from '@/api/emails';
import { SelectDropdown } from '@/components/shared/SelectDropdown';
import type { EmailEvent } from '@/api/emails';
import { userErrorMessage } from '@/lib/errors';
import { SortableHeader } from '@/components/shared/SortableHeader';
import {
  AlertCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatHumanDateTime } from '@/lib/dates';
import type { TFunction } from 'i18next';

type StatusFilter = EmailEvent['status'];
type TypeFilter = EmailEvent['emailType'];
type SortField = 'enqueuedAt' | 'sentAt';
type SortDir = 'asc' | 'desc';

function parseTriggeredBy(
  raw: string,
  t: TFunction
): { label: string; auth0Id?: string } {
  if (raw === 'claim_auto') return { label: t('fellows.emails.triggeredAuto') };
  if (raw.startsWith('admin_manual:')) {
    const parts = raw.replace('admin_manual:', '').split(':');
    if (parts.length >= 2) {
      const auth0Id = parts[0];
      const name = parts.slice(1).join(':');
      return { label: t('fellows.emails.triggeredManual', { name }), auth0Id };
    }
    return {
      label: t('fellows.emails.triggeredManual', { name: parts[0] }),
      auth0Id: parts[0],
    };
  }
  return { label: raw };
}

function formatEmailType(type: EmailEvent['emailType'], t: TFunction): string {
  return type === 'VIT_ID_INVITATION'
    ? t('fellows.emails.typeVitId')
    : t('fellows.emails.typeBio');
}

// Valid values for URL-sourced filter/sort params; anything else in the URL
// silently falls back to the default so a mangled link never breaks the page.
const EMAIL_TYPES: ReadonlySet<string> = new Set([
  'VIT_ID_INVITATION',
  'BIO_PROJECT_DESCRIPTION',
]);
const EMAIL_STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
]);
const SORT_FIELDS: ReadonlySet<string> = new Set(['enqueuedAt', 'sentAt']);

const STATUS_STYLES: Record<EmailEvent['status'], string> = {
  PENDING: 'tone-info',
  SENDING: 'tone-warning',
  SENT: 'tone-success',
  FAILED: 'tone-danger',
  SKIPPED: 'tone-neutral',
};

function StatusBadge({ status, failureReason }: { status: EmailEvent['status']; failureReason?: string | null }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status])}
      title={
        status === 'SKIPPED' && failureReason
          ? t('fellows.emails.skippedTitle', { reason: failureReason })
          : undefined
      }
    >
      {t(`fellows.emails.status.${status}`)}
    </span>
  );
}

// --- Sent Emails Tab ---

function SentEmailsTab() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth for the server-side filters (year/type/
  // status) and the sort, so filtered views survive reload and are shareable.
  // Absent params fall back to the previous local-state defaults.
  const yearFilter = searchParams.get('year') ?? 'all';
  const typeParam = searchParams.get('type');
  const typeFilter: TypeFilter | 'all' =
    typeParam && EMAIL_TYPES.has(typeParam) ? (typeParam as TypeFilter) : 'all';
  const statusFilters = useMemo(
    () =>
      new Set(
        (searchParams.get('status') ?? '')
          .split(',')
          .filter((s): s is StatusFilter => EMAIL_STATUSES.has(s))
      ),
    [searchParams]
  );
  const sortParam = searchParams.get('sort');
  const sortField: SortField =
    sortParam && SORT_FIELDS.has(sortParam) ? (sortParam as SortField) : 'enqueuedAt';
  const sortDir: SortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const [nameSearch, setNameSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [knownYears, setKnownYears] = useState<string[]>([]);

  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setYearFilter = useCallback(
    (year: string) => {
      updateParams((next) => {
        if (year !== 'all') next.set('year', year);
        else next.delete('year');
      });
    },
    [updateParams]
  );

  const setTypeFilter = useCallback(
    (type: TypeFilter | 'all') => {
      updateParams((next) => {
        if (type !== 'all') next.set('type', type);
        else next.delete('type');
      });
    },
    [updateParams]
  );

  const statusParam = statusFilters.size > 0 ? [...statusFilters].join(',') : undefined;

  // The filters are part of the query key, so changing any of them resets the
  // infinite query to its first page; the cursor chain is TanStack's page
  // param and never lives in component state.
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useEmailEvents({
    year: yearFilter !== 'all' ? yearFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusParam,
    limit: 100,
  });

  const events = useMemo(() => data?.pages.flatMap((page) => page.events) ?? [], [data]);

  // Year options come from the unfiltered list and stick once seen, so the
  // dropdown does not collapse to a single year while a filter is active.
  const isUnfiltered = yearFilter === 'all' && typeFilter === 'all' && !statusParam;
  useEffect(() => {
    if (!isUnfiltered || events.length === 0) return;
    const years = [...new Set(events.map((e) => e.academicYear))].sort().reverse();
    setKnownYears((prev) => (years.join(',') === prev.join(',') ? prev : years));
  }, [isUnfiltered, events]);

  // The active filter must always be among the options: on a deep link
  // (?year=X) knownYears is still empty, and SelectDropdown renders its
  // placeholder ("All years") for values it doesn't know — while the list IS
  // filtered by X. Splice the active year in until the unfiltered seed runs.
  const academicYears = useMemo(
    () =>
      yearFilter !== 'all' && !knownYears.includes(yearFilter)
        ? [...knownYears, yearFilter].sort().reverse()
        : knownYears,
    [knownYears, yearFilter]
  );
  const hasActiveFilters = yearFilter !== 'all' || typeFilter !== 'all' || statusFilters.size > 0 || nameSearch.length > 0;

  const sorted = useMemo(() => {
    let result = [...events];
    if (nameSearch) {
      const q = nameSearch.toLowerCase();
      result = result.filter((e) => e.appointeeName.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [events, nameSearch, sortField, sortDir]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  function toggleSort(field: SortField) {
    const nextField = field;
    const nextDir: SortDir =
      sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    updateParams((next) => {
      // Keep the URL clean: the default sort (enqueuedAt desc) carries no params.
      if (nextField === 'enqueuedAt' && nextDir === 'desc') {
        next.delete('sort');
        next.delete('dir');
      } else {
        next.set('sort', nextField);
        next.set('dir', nextDir);
      }
    });
  }

  function toggleStatus(status: StatusFilter) {
    const nextSet = new Set(statusFilters);
    if (nextSet.has(status)) nextSet.delete(status);
    else nextSet.add(status);
    updateParams((next) => {
      if (nextSet.size > 0) next.set('status', [...nextSet].join(','));
      else next.delete('status');
    });
  }

  if (isLoading) return <EmailsSkeleton />;
  // A failed fetchNextPage keeps the loaded rows on screen and reports inline
  // next to the "Load more" button; only first-page failures take over here.
  if (error && !isFetchNextPageError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{t('fellows.emails.loadFailed')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder={t('fellows.emails.searchPlaceholder')}
          aria-label={t('fellows.emails.searchAria')}
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          className="h-9 w-64"
          />

        <SelectDropdown
          id="email-year-filter"
          ariaLabel={t('fellows.emails.yearFilterAria')}
          options={[
            { value: 'all', label: t('fellows.emails.allYears') },
            ...academicYears.map((year) => ({ value: year, label: year })),
          ]}
          value={yearFilter}
          allowEmpty={false}
          onSelect={(year) => setYearFilter(year)}
          placeholder={t('fellows.emails.allYears')}
          className="h-9 w-auto min-w-[130px] px-3 py-1.5 text-sm"
        />

        <SelectDropdown
          id="email-type-filter"
          ariaLabel={t('fellows.emails.typeFilterAria')}
          options={[
            { value: 'all', label: t('fellows.emails.allTypes') },
            { value: 'VIT_ID_INVITATION', label: t('fellows.emails.typeVitId') },
            { value: 'BIO_PROJECT_DESCRIPTION', label: t('fellows.emails.typeBio') },
          ]}
          value={typeFilter}
          allowEmpty={false}
          onSelect={(type) => setTypeFilter(type as TypeFilter | 'all')}
          placeholder={t('fellows.emails.allTypes')}
          className="h-9 w-auto min-w-[150px] px-3 py-1.5 text-sm"
        />

        <div className="flex items-center gap-1.5" role="group" aria-label={t('fellows.emails.statusGroupAria')}>
          {(['PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-label={t('fellows.emails.statusFilterAria', { status: t(`fellows.emails.status.${s}`) })}
              aria-pressed={statusFilters.has(s)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity',
                STATUS_STYLES[s],
                statusFilters.size > 0 && !statusFilters.has(s) && 'opacity-40'
              )}
            >
              {t(`fellows.emails.status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? t('fellows.emails.emptyFilteredTitle') : t('fellows.emails.emptyTitle')}
          description={hasActiveFilters
            ? t('fellows.emails.emptyFilteredDescription')
            : t('fellows.emails.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('fellows.emails.colName')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('fellows.emails.colYear')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('fellows.emails.colType')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('fellows.emails.colStatus')}</th>
                <SortableHeader
                  field="enqueuedAt"
                  label={t('fellows.emails.colEnqueued')}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  className="px-4 py-3 font-medium text-muted-foreground"
                  buttonClassName="text-sm normal-case tracking-normal"
                />
                <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">{t('fellows.emails.colTriggeredBy')}</th>
                <th className="w-10 px-4 py-3"><span className="sr-only">{t('fellows.emails.colDetails')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((event) => (
                // The row is a pointer shortcut only. Keyboard users get the
                // real button in the last cell — a <tr> cannot carry
                // aria-selected or a tab stop outside grid semantics.
                <tr
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/30',
                    selectedEventId === event.id && 'bg-muted/40'
                  )}
                >
                  <td className="px-4 py-3 font-medium">{event.appointeeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{event.academicYear}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatEmailType(event.emailType, t)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} failureReason={event.failureReason} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatHumanDateTime(event.enqueuedAt, i18n.language)}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{parseTriggeredBy(event.triggeredBy, t).label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <button
                      type="button"
                      aria-label={t('fellows.emails.viewDetailsAria', { name: event.appointeeName })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEventId(event.id);
                      }}
                      className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div className="mt-4 text-center">
          {isFetchNextPageError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {t('fellows.emails.loadMoreFailed')}
            </p>
          )}
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isFetchingNextPage
              ? t('fellows.emails.loading')
              : isFetchNextPageError
                ? t('fellows.emails.tryAgain')
                : t('fellows.emails.loadMore')}
          </button>
        </div>
      )}

      {/* Drill-in drawer */}
      <EmailDrawer event={selectedEvent} onClose={() => setSelectedEventId(null)} />
    </>
  );
}

// --- Drill-in Drawer ---

function EmailDrawer({ event, onClose }: { event: EmailEvent | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data: preview, isLoading: previewLoading, error: previewError } = useEmailEventPreview(event?.id ?? null);
  const [copied, setCopied] = useState(false);

  const copyMessageId = useCallback(() => {
    if (event?.sesMessageId) {
      void navigator.clipboard.writeText(event.sesMessageId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [event?.sesMessageId]);

  return (
    <Sheet open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[480px] max-w-[90vw] gap-0 shadow-xl sm:max-w-[480px]"
      >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <SheetTitle className="text-lg font-semibold">{t('fellows.emails.drawerTitle')}</SheetTitle>
            <SheetClose
              render={<button type="button" className="rounded-md p-1.5 hover:bg-muted" aria-label={t('common.close')} />}
            >
              <X className="h-4 w-4" />
            </SheetClose>
          </div>

          {event && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Status + timestamps */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} failureReason={event.failureReason} />
                  <span className="text-sm text-muted-foreground">{formatEmailType(event.emailType, t)}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t('fellows.emails.appointee')}</dt>
                  <dd className="font-medium">{event.appointeeName}</dd>
                  <dt className="text-muted-foreground">{t('fellows.emails.academicYear')}</dt>
                  <dd>{event.academicYear}</dd>
                  <dt className="text-muted-foreground">{t('fellows.emails.colEnqueued')}</dt>
                  <dd>{formatHumanDateTime(event.enqueuedAt, i18n.language)}</dd>
                  {event.sentAt && (
                    <>
                      <dt className="text-muted-foreground">{t('fellows.emails.sent')}</dt>
                      <dd>{formatHumanDateTime(event.sentAt, i18n.language)}</dd>
                    </>
                  )}
                  {event.status === 'FAILED' && (
                    <>
                      <dt className="text-muted-foreground">{t('fellows.emails.failed')}</dt>
                      <dd>{formatHumanDateTime(event.updatedAt, i18n.language)}</dd>
                    </>
                  )}
                  {(() => {
                    const triggered = parseTriggeredBy(event.triggeredBy, t);
                    return (
                      <>
                        <dt className="text-muted-foreground">{t('fellows.emails.colTriggeredBy')}</dt>
                        <dd>{triggered.label}</dd>
                        {triggered.auth0Id && (
                          <>
                            <dt className="text-muted-foreground">{t('fellows.emails.auth0Id')}</dt>
                            <dd className="break-all font-mono text-xs">{triggered.auth0Id}</dd>
                          </>
                        )}
                      </>
                    );
                  })()}
                </dl>
              </div>

              {/* Failure reason */}
              {event.status === 'FAILED' && event.failureReason && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3">
                  <p className="text-sm font-medium text-destructive">{t('fellows.emails.failureReason')}</p>
                  <p className="mt-1 text-sm text-destructive/80">{event.failureReason}</p>
                </div>
              )}

              {/* SKIPPED reason */}
              {event.status === 'SKIPPED' && event.failureReason && (
                <div className="rounded-md border border-border bg-muted/50 px-4 py-3">
                  <p className="text-sm font-medium text-muted-foreground">{t('fellows.emails.skippedReason')}</p>
                  <p className="mt-1 text-sm">{event.failureReason}</p>
                </div>
              )}

              {/* SES message ID */}
              {event.sesMessageId && (
                <div className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">{t('fellows.emails.sesId')}</span>
                  <code className="flex-1 truncate text-xs">{event.sesMessageId}</code>
                  <button
                    type="button"
                    onClick={copyMessageId}
                    className="rounded p-1 hover:bg-muted"
                    aria-label={t('fellows.emails.copySesAria')}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              {/* Email preview */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('fellows.emails.previewHeading')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('fellows.emails.previewNote')}
                </p>
                {preview?.recipientStatus === 'contact_deleted' && (
                  <div className="rounded-md border border-warning-border bg-warning px-3 py-2 text-xs text-warning-foreground">
                    {t('fellows.emails.recipientDeleted')}
                  </div>
                )}
                {preview?.recipientStatus === 'no_first_name' && (
                  <div className="rounded-md border border-warning-border bg-warning px-3 py-2 text-xs text-warning-foreground">
                    {t('fellows.emails.recipientNoFirstName')}
                  </div>
                )}
                {previewLoading && (
                  <div className="flex h-48 items-center justify-center rounded-md border border-border bg-muted/30">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
                {previewError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {t('fellows.emails.previewLoadFailed', {
                      message: userErrorMessage(previewError, t),
                    })}
                  </div>
                )}
                {preview && (
                  <iframe
                    srcDoc={preview.html}
                    sandbox=""
                    className="w-full rounded-md border border-border"
                    style={{ minHeight: '300px' }}
                    title={t('fellows.emails.previewIframeTitle')}
                  />
                )}
              </div>

              {/* Deep-link to Manage Appointees for FAILED rows */}
              {event.status === 'FAILED' && (
                <a
                  href="/admin/fellows"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-crimson hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('fellows.emails.openInManage')}
                </a>
              )}
            </div>
          )}
      </SheetContent>
    </Sheet>
  );
}

// --- Templates Tab ---

function TemplatesTab() {
  const { t } = useTranslation();
  const { data: vitPreview, isLoading: vitLoading, error: vitError } = useTemplatePreview('vit-id-invitation');
  const { data: bioPreview, isLoading: bioLoading, error: bioError } = useTemplatePreview('bio-project-description');

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="fellows.emails.templatesNote"
          components={{ code: <code className="rounded bg-muted px-1.5 py-0.5 text-xs" /> }}
        />
      </p>

      <TemplateCard
        title={t('fellows.emails.templateVitTitle')}
        subject={vitPreview?.subject}
        html={vitPreview?.html}
        text={vitPreview?.text}
        bcc={vitPreview?.bcc}
        isLoading={vitLoading}
        error={vitError}
      />

      <TemplateCard
        title={t('fellows.emails.templateBioTitle')}
        subject={bioPreview?.subject}
        html={bioPreview?.html}
        text={bioPreview?.text}
        bcc={bioPreview?.bcc}
        isLoading={bioLoading}
        error={bioError}
      />
    </div>
  );
}

function TemplateCard({
  title,
  subject,
  html,
  text,
  bcc,
  isLoading,
  error,
}: {
  title: string;
  subject?: string;
  html?: string;
  text?: string;
  bcc?: string[];
  isLoading: boolean;
  error: Error | null;
}) {
  const { t } = useTranslation();
  const [showText, setShowText] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {subject && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('fellows.emails.subject', { subject })}
          </p>
        )}
        {bcc && bcc.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('fellows.emails.bcc', { list: bcc.join(', ') })}
          </p>
        )}
      </div>
      <div className="p-5">
        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {t('fellows.emails.templateLoadFailed')}
          </div>
        )}
        {html && (
          <>
            <iframe
              srcDoc={html}
              sandbox=""
              className="w-full rounded-md border border-border"
              style={{ minHeight: '400px' }}
              title={t('fellows.emails.templatePreviewTitle', { title })}
            />
            {text && (
              <details className="mt-4" open={showText} onToggle={(e) => setShowText((e.target as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  {t('fellows.emails.plainTextVersion')}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
                  {text}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- How Emails Work Tab ---

function HowEmailsWorkTab() {
  const { t } = useTranslation();
  // Shared inline-markup slots for the Trans-rendered doc paragraphs. codeSend
  // carries its own children because "sendAfter <= now" cannot live inside a
  // translation string (the "<=" breaks the tag parser).
  const markup = {
    strong: <strong />,
    code: <code />,
    codeSend: <code>sendAfter &lt;= now</code>,
  };
  return (
    <div className="prose prose-sm max-w-none">
      <p className="text-muted-foreground">{t('fellows.emails.how.intro')}</p>

      <div className="mt-6 space-y-4">
        {/* VIT ID Invitation */}
        <details open className="rounded-lg border border-border">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold hover:bg-muted/30">
            {t('fellows.emails.how.vitTitle')}
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm leading-relaxed">
            <p>
              <Trans i18nKey="fellows.emails.how.vit1" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.vit2" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.vit3" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.vit4" components={markup} />
            </p>
          </div>
        </details>

        {/* Bio & Project Description */}
        <details open className="rounded-lg border border-border">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold hover:bg-muted/30">
            {t('fellows.emails.how.bioTitle')}
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm leading-relaxed">
            <p>
              <Trans i18nKey="fellows.emails.how.bio1" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.bio2" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.bio3" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.bio4" components={markup} />
            </p>
            <p>
              <Trans i18nKey="fellows.emails.how.bio5" components={markup} />
            </p>
          </div>
        </details>

        {/* Dev redirect note */}
        <div className="rounded-md border border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
          <Trans i18nKey="fellows.emails.how.devNote" components={markup} />
        </div>
      </div>
    </div>
  );
}

// --- Skeleton ---

function EmailsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <SkeletonBlock className="h-9 w-32" />
        <SkeletonBlock className="h-9 w-32" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// --- Main Page ---

export function EmailsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        title={t('fellows.emails.title')}
        description={t('fellows.emails.description')}
      />

      <Tabs defaultValue="sent" className="gap-6">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-0 rounded-none border-b border-border p-0"
        >
          <TabsTrigger
            value="sent"
            className="flex-none px-4 py-2.5 data-active:text-foreground"
          >
            {t('fellows.emails.tabSent')}
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="flex-none px-4 py-2.5 data-active:text-foreground"
          >
            {t('fellows.emails.tabTemplates')}
          </TabsTrigger>
          <TabsTrigger
            value="how-it-works"
            className="flex-none px-4 py-2.5 data-active:text-foreground"
          >
            {t('fellows.emails.tabHow')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent">
          <SentEmailsTab />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="how-it-works">
          <HowEmailsWorkTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
