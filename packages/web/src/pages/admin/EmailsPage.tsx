import { useState, useMemo, useCallback, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useEmailEvents, useEmailEventPreview, useTemplatePreview } from '@/api/emails';
import { useApiToken } from '@/api/client';
import type { EmailEvent, EmailEventsResponse } from '@/api/emails';
import {
  Mail,
  AlertCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusFilter = EmailEvent['status'];
type TypeFilter = EmailEvent['emailType'];
type SortField = 'enqueuedAt' | 'sentAt';
type SortDir = 'asc' | 'desc';

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function formatTriggeredBy(raw: string): string {
  if (raw === 'claim_auto') return 'Auto on claim';
  if (raw.startsWith('admin_manual:')) {
    const sub = raw.replace('admin_manual:', '');
    return `Manual (${sub})`;
  }
  return raw;
}

function formatEmailType(type: EmailEvent['emailType']): string {
  return type === 'VIT_ID_INVITATION' ? 'VIT ID Invitation' : 'Bio & Project';
}

const STATUS_STYLES: Record<EmailEvent['status'], string> = {
  PENDING: 'bg-blue-50 text-blue-700',
  SENDING: 'bg-amber-50 text-amber-700',
  SENT: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status, failureReason }: { status: EmailEvent['status']; failureReason?: string | null }) {
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status])}
      title={status === 'SKIPPED' && failureReason ? `Skipped at dispatch time. Reason: ${failureReason}` : undefined}
    >
      {status}
    </span>
  );
}

// --- Sent Emails Tab ---

function SentEmailsTab() {
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter | 'all'>('all');
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(new Set());
  const [sortField, setSortField] = useState<SortField>('enqueuedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loadedPages, setLoadedPages] = useState<EmailEvent[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [knownYears, setKnownYears] = useState<string[]>([]);
  const lastDataRef = useRef<unknown>(null);

  const statusParam = statusFilters.size > 0 ? [...statusFilters].join(',') : undefined;

  const { data, isLoading, error } = useEmailEvents({
    year: yearFilter !== 'all' ? yearFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusParam,
    limit: 100,
  });

  if (data && data !== lastDataRef.current) {
    lastDataRef.current = data;
    setNextCursor(data.nextCursor);
    setLoadedPages([]);
    if (yearFilter === 'all' && typeFilter === 'all' && !statusParam) {
      const years = [...new Set(data.events.map((e) => e.academicYear))].sort().reverse();
      if (years.length > 0) setKnownYears(years);
    }
  }

  const events = useMemo(() => {
    const firstPage = data?.events || [];
    return [...firstPage, ...loadedPages.flat()];
  }, [data, loadedPages]);

  const academicYears = knownYears;
  const hasActiveFilters = yearFilter !== 'all' || typeFilter !== 'all' || statusFilters.size > 0;

  const sorted = useMemo(() => {
    const result = [...events];
    result.sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [events, sortField, sortDir]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  function toggleStatus(status: StatusFilter) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const getToken = useApiToken();
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await getToken();
      const url = new URL(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/emails`, window.location.origin);
      url.searchParams.set('limit', '100');
      url.searchParams.set('cursor', nextCursor);
      if (yearFilter !== 'all') url.searchParams.set('year', yearFilter);
      if (typeFilter !== 'all') url.searchParams.set('type', typeFilter);
      if (statusParam) url.searchParams.set('status', statusParam);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Load more failed: ${res.status}`);
      const page = (await res.json()) as EmailEventsResponse;
      setLoadedPages((prev) => [...prev, page.events]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, getToken, yearFilter, typeFilter, statusParam]);

  if (isLoading) return <EmailsSkeleton />;
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to load emails. Please try again.</p>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          id="email-year-filter"
          aria-label="Filter by academic year"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">All years</option>
          {academicYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <select
          id="email-type-filter"
          aria-label="Filter by email type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter | 'all')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">All types</option>
          <option value="VIT_ID_INVITATION">VIT ID Invitation</option>
          <option value="BIO_PROJECT_DESCRIPTION">Bio & Project</option>
        </select>

        <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
          {(['PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-label={`${s} status filter`}
              aria-pressed={statusFilters.has(s)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity',
                STATUS_STYLES[s],
                statusFilters.size > 0 && !statusFilters.has(s) && 'opacity-40'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No emails match these filters' : 'No emails sent yet'}
          description={hasActiveFilters
            ? 'Try adjusting the year, type, or status filters.'
            : 'Once invitations or bio requests go out, they\'ll appear here.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button onClick={() => toggleSort('enqueuedAt')} className="inline-flex items-center gap-1 hover:text-foreground">
                    Enqueued
                    {sortField === 'enqueuedAt' && (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">Triggered by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((event) => (
                <tr
                  key={event.id}
                  tabIndex={0}
                  aria-selected={selectedEventId === event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedEventId(event.id);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <td className="px-4 py-3 font-medium">
                    <button
                      className="sr-only"
                      aria-label={`View details for ${event.appointeeName}`}
                      tabIndex={-1}
                    />
                    {event.appointeeName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatEmailType(event.emailType)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} failureReason={event.failureReason} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(event.enqueuedAt)}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatTriggeredBy(event.triggeredBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
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
  const { data: preview, isLoading: previewLoading, error: previewError } = useEmailEventPreview(event?.id ?? null);
  const [copied, setCopied] = useState(false);

  const copyMessageId = useCallback(() => {
    if (event?.sesMessageId) {
      navigator.clipboard.writeText(event.sesMessageId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [event?.sesMessageId]);

  return (
    <Dialog.Root open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-[90vw] flex-col border-l border-border bg-background shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="text-lg font-semibold">Email Details</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1.5 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {event && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Status + timestamps */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} failureReason={event.failureReason} />
                  <span className="text-sm text-muted-foreground">{formatEmailType(event.emailType)}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Appointee</dt>
                  <dd className="font-medium">{event.appointeeName}</dd>
                  <dt className="text-muted-foreground">Academic year</dt>
                  <dd>{event.academicYear}</dd>
                  <dt className="text-muted-foreground">Enqueued</dt>
                  <dd>{formatDateTime(event.enqueuedAt)}</dd>
                  {event.sentAt && (
                    <>
                      <dt className="text-muted-foreground">Sent</dt>
                      <dd>{formatDateTime(event.sentAt)}</dd>
                    </>
                  )}
                  {event.status === 'FAILED' && (
                    <>
                      <dt className="text-muted-foreground">Failed</dt>
                      <dd>{formatDateTime(event.updatedAt)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Triggered by</dt>
                  <dd>{formatTriggeredBy(event.triggeredBy)}</dd>
                </dl>
              </div>

              {/* Failure reason */}
              {event.status === 'FAILED' && event.failureReason && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3">
                  <p className="text-sm font-medium text-destructive">Failure reason</p>
                  <p className="mt-1 text-sm text-destructive/80">{event.failureReason}</p>
                </div>
              )}

              {/* SKIPPED reason */}
              {event.status === 'SKIPPED' && event.failureReason && (
                <div className="rounded-md border border-border bg-muted/50 px-4 py-3">
                  <p className="text-sm font-medium text-muted-foreground">Skipped reason</p>
                  <p className="mt-1 text-sm">{event.failureReason}</p>
                </div>
              )}

              {/* SES message ID */}
              {event.sesMessageId && (
                <div className="flex items-center gap-2 rounded-md border border-border px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">SES ID:</span>
                  <code className="flex-1 truncate text-xs">{event.sesMessageId}</code>
                  <button
                    onClick={copyMessageId}
                    className="rounded p-1 hover:bg-muted"
                    aria-label="Copy SES message ID"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              {/* Email preview */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Email preview</h3>
                <p className="text-xs text-muted-foreground">
                  Re-rendered with current data; may differ from what was originally sent if the appointee's name has changed.
                </p>
                {preview?.recipientStatus === 'contact_deleted' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Original recipient no longer in CiviCRM. Rendered with placeholder name.
                  </div>
                )}
                {preview?.recipientStatus === 'no_first_name' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Original recipient has no first name on file. Rendered with placeholder name.
                  </div>
                )}
                {previewLoading && (
                  <div className="flex h-48 items-center justify-center rounded-md border border-border bg-muted/30">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
                {previewError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    Failed to load preview: {(previewError as Error).message}
                  </div>
                )}
                {preview && (
                  <iframe
                    srcDoc={preview.html}
                    sandbox=""
                    className="w-full rounded-md border border-border"
                    style={{ minHeight: '300px' }}
                    title="Email preview"
                  />
                )}
              </div>

              {/* Deep-link to Manage Appointees for FAILED rows */}
              {event.status === 'FAILED' && (
                <a
                  href="/admin/fellows"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Manage Appointees
                </a>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// --- Templates Tab ---

function TemplatesTab() {
  const { data: vitPreview, isLoading: vitLoading, error: vitError } = useTemplatePreview('vit-id-invitation');
  const { data: bioPreview, isLoading: bioLoading, error: bioError } = useTemplatePreview('bio-project-description');

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These are read-only references. Edits to the templates happen in{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">packages/server/src/templates/emails/</code>.
      </p>

      <TemplateCard
        title="VIT ID Invitation"
        subject={vitPreview?.subject}
        html={vitPreview?.html}
        text={vitPreview?.text}
        bcc={vitPreview?.bcc}
        isLoading={vitLoading}
        error={vitError}
      />

      <TemplateCard
        title="Bio & Project Description"
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
  const [showText, setShowText] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {subject && <p className="mt-1 text-sm text-muted-foreground">Subject: {subject}</p>}
        {bcc && bcc.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">BCC: {bcc.join(', ')}</p>
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
            Failed to load template preview.
          </div>
        )}
        {html && (
          <>
            <iframe
              srcDoc={html}
              sandbox=""
              className="w-full rounded-md border border-border"
              style={{ minHeight: '400px' }}
              title={`${title} preview`}
            />
            {text && (
              <details className="mt-4" open={showText} onToggle={(e) => setShowText((e.target as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Plain-text version
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
  return (
    <div className="prose prose-sm max-w-none">
      <p className="text-muted-foreground">
        This page explains when and how each email type is sent. The trigger logic lives across
        three service files; this is the human-readable summary.
      </p>

      <div className="mt-6 space-y-4">
        {/* VIT ID Invitation */}
        <details open className="rounded-lg border border-border">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold hover:bg-muted/30">
            VIT ID Invitation email
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm leading-relaxed">
            <p>
              <strong>Manual only.</strong> There is no automatic trigger. The daily cron explicitly
              skips VIT_ID_INVITATION rows.
            </p>
            <p>
              Sent when an admin clicks <strong>"Send VIT ID email"</strong> on Manage Appointees.
              The handler runs eligibility checks (appointee has an accepted fellowship for the year,
              no existing VIT ID, valid CiviCRM primary email, has a first name on file, not in
              needs-review state), enqueues a row with no delay, and dispatches synchronously.
            </p>
            <p>
              <strong>Why manual?</strong> Eligibility windows differ per appointee
              (accepted-but-not-yet-arrived vs. arrived vs. departed), and the email body contains
              a claim CTA that should be a conscious decision by the sender, not an automatic action.
            </p>
            <p>
              <strong>Idempotency:</strong> if a SENT row already exists for this fellowship, the
              button refuses with "already sent". If a SENDING row exists (another dispatch is
              in-flight), it returns the in-flight status without duplicating. Resend after
              FAILED/SKIPPED creates a new row preserving history.
            </p>
          </div>
        </details>

        {/* Bio & Project Description */}
        <details open className="rounded-lg border border-border">
          <summary className="cursor-pointer px-5 py-4 text-base font-semibold hover:bg-muted/30">
            Bio & Project Description email
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm leading-relaxed">
            <p>
              <strong>Both automatic and manual.</strong>
            </p>
            <p>
              <strong>Automatic trigger:</strong> when an appointee successfully claims their portal
              account through the Auth0 claim flow. The claim handler enqueues the email with a{' '}
              <strong>24-hour delay</strong> and <code>triggeredBy: 'claim_auto'</code>. The delay
              gives the appointee time to settle in before being asked to fill in their bio.
            </p>
            <p>
              <strong>Cron dispatch:</strong> the daily appointee-email cron at{' '}
              <strong>09:00 Europe/Rome timezone</strong> picks up due BIO rows
              (<code>sendAfter &lt;= now</code>, status = PENDING) and dispatches them. The cron is
              gated by env var <code>APPOINTEE_EMAIL_CRON_ENABLED</code>.
            </p>
            <p>
              <strong>Manual trigger:</strong> admin clicks <strong>"Send bio email"</strong> on Manage
              Appointees. Dispatches immediately (no delay), idempotent against any existing
              PENDING/SENDING row for the same fellowship.
            </p>
            <p>
              <strong>SKIPPED status:</strong> when an enqueued row reaches dispatch time, the
              eligibility check re-runs against current CiviCRM/Auth0 state. If eligibility has been
              lost between enqueue and dispatch (e.g., Auth0 account deleted, fellowship withdrawn,
              primary email removed), the row transitions to SKIPPED with the specific reason. SKIPPED
              is a non-error: the system correctly decided not to send.
            </p>
          </div>
        </details>

        {/* Dev redirect note */}
        <div className="rounded-md border border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
          <strong>Dev/staging note:</strong> in non-production environments, both emails honor{' '}
          <code>APPOINTEE_EMAIL_REDIRECT_TO</code> — outbound mail goes to the configured dev
          inbox and the BCC list is dropped.
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
  return (
    <div>
      <PageHeader
        title="Emails"
        description="Audit trail of sent emails, template previews, and trigger reference."
      />

      <Tabs.Root defaultValue="sent" className="space-y-6">
        <Tabs.List className="flex border-b border-border">
          <Tabs.Trigger
            value="sent"
            className="relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-primary"
          >
            Sent emails
          </Tabs.Trigger>
          <Tabs.Trigger
            value="templates"
            className="relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-primary"
          >
            Templates
          </Tabs.Trigger>
          <Tabs.Trigger
            value="how-it-works"
            className="relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-primary"
          >
            How emails work
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="sent">
          <SentEmailsTab />
        </Tabs.Content>
        <Tabs.Content value="templates">
          <TemplatesTab />
        </Tabs.Content>
        <Tabs.Content value="how-it-works">
          <HowEmailsWorkTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
