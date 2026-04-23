import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import { AppointeeStatusBadge } from '@/components/shared/AppointeeStatusBadge';
import {
  EmailPreviewModal,
  type EmailPreviewData,
} from '@/components/shared/EmailPreviewModal';
import {
  useFellowsDashboard,
  useSendBioEmail,
  useSendVitIdEmail,
  useEmailPreview,
  SendBioEmailError,
  SendVitIdEmailError,
  EmailPreviewError,
  type SendBioEmailReason,
  type SendVitIdEmailReason,
  type EmailPreviewType,
} from '@/api/fellows';
import { getCurrentAcademicYear } from './utils/academic-year';
import {
  Users,
  UserX,
  UserCheck,
  UserSearch,
  Search,
  AlertCircle,
  ExternalLink,
  AlertTriangle,
  Mail,
  UserPlus,
  Loader2,
} from 'lucide-react';
import type {
  FellowDashboardEntry,
  VitIdStatus,
  BioEmailStatus,
} from '@itatti/shared';

const CIVICRM_URL = import.meta.env.VITE_CIVICRM_URL || '';

type FilterTab = 'all' | VitIdStatus;

export function FellowsManagementPage() {
  const currentYear = getCurrentAcademicYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useFellowsDashboard(selectedYear || undefined);

  const filteredFellows = useMemo(() => {
    if (!data) return [];
    let fellows = data.fellows;

    // Filter by status tab
    if (activeTab !== 'all') {
      fellows = fellows.filter((f) => f.status === activeTab);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      fellows = fellows.filter(
        (f) =>
          f.firstName.toLowerCase().includes(q) ||
          f.lastName.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q)
      );
    }

    return fellows;
  }, [data, activeTab, searchQuery]);

  if (isLoading) return <FellowsManagementSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader
          title="Manage Appointees"
          description="Track the onboarding lifecycle of current and past appointees."
        />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">Failed to load appointees</h3>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? {
    total: 0,
    noAccount: 0,
    active: 0,
    activeDifferentEmail: 0,
    needsReview: 0,
  };
  const academicYears = data?.academicYears ?? [];

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.total },
    { key: 'needs-review', label: 'Needs Review', count: summary.needsReview },
    { key: 'active-different-email', label: 'Different Email', count: summary.activeDifferentEmail },
    { key: 'no-account', label: 'Needs Account', count: summary.noAccount },
    { key: 'active', label: 'Active', count: summary.active },
  ];

  // Dynamic subtitle: "YYYY-YYYY Appointees" when a year is selected,
  // "All appointees" when the dropdown is cleared. Reacts on every change.
  const subtitle = selectedYear
    ? `${selectedYear} Appointees`
    : 'All appointees';

  return (
    <div>
      <PageHeader
        title="Manage Appointees"
        description="Track the onboarding lifecycle of current and past appointees."
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-[1.25rem] font-semibold tracking-tight text-foreground">
          {subtitle}
        </h2>
        <select
          value={selectedYear}
          onChange={(e) => {
            setSelectedYear(e.target.value);
            setActiveTab('all');
            setSearchQuery('');
          }}
          className="min-w-[150px] rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All years</option>
          {academicYears.length > 0 ? (
            academicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))
          ) : (
            <option value={currentYear}>{currentYear}</option>
          )}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          label="Total Fellows"
          value={summary.total}
          icon={<Users className="h-5 w-5 text-primary" />}
        />
        <SummaryCard
          label="Needs Review"
          value={summary.needsReview}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          valueClassName="text-amber-700"
        />
        <SummaryCard
          label="Different Email"
          value={summary.activeDifferentEmail}
          icon={<UserSearch className="h-5 w-5 text-amber-500" />}
          valueClassName="text-amber-600"
        />
        <SummaryCard
          label="Needs Account"
          value={summary.noAccount}
          icon={<UserX className="h-5 w-5 text-destructive" />}
          valueClassName="text-destructive"
        />
        <SummaryCard
          label="Active"
          value={summary.active}
          icon={<UserCheck className="h-5 w-5 text-green-600" />}
          valueClassName="text-green-600"
        />
      </div>

      {/* Filter Tabs */}
      <div className="mb-5 flex gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t-lg border-b-2 px-4 py-2.5 text-[0.95rem] font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search (year dropdown is now the hero control next to the H2) */}
      <div className="mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border bg-background py-2.5 pl-10 pr-4 text-base outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Fellows Table */}
      {filteredFellows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12 mb-4" />}
          title="No fellows found"
          description={
            searchQuery
              ? 'Try adjusting your search query.'
              : 'No fellows match the current filters.'
          }
        />
      ) : (
        <FellowsTable fellows={filteredFellows} />
      )}
    </div>
  );
}

function FellowsManagementSkeleton() {
  return (
    <div className="space-y-8 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-64 rounded-full" />
        <SkeletonBlock className="h-5 w-[28rem] max-w-full rounded-full" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3.5 w-24 rounded-full" />
              <SkeletonBlock className="h-5 w-5 rounded-full" />
            </div>
            <SkeletonBlock className="mt-4 h-8 w-16 rounded-full" />
          </div>
        ))}
      </div>

      <div className="space-y-5">
        <div className="flex gap-2 border-b pb-0.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-28 rounded-t-lg" />
          ))}
        </div>

        <div className="flex gap-4">
          <SkeletonBlock className="h-11 flex-1 rounded-md" />
          <SkeletonBlock className="h-11 w-40 rounded-md" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/50 px-4 py-3">
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-3.5 rounded-full" />
              ))}
            </div>
          </div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 items-center gap-4 px-4 py-4">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="h-8 w-8 rounded-full bg-muted/80" />
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-28 rounded-full" />
                    <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                  </div>
                </div>
                {Array.from({ length: 4 }).map((__, column) => (
                  <SkeletonBlock key={column} className="h-4 w-20 rounded-full" />
                ))}
                <SkeletonBlock className="h-4 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.8rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={`mt-3 text-[1.9rem] font-semibold tracking-tight ${valueClassName || ''}`}>{value}</div>
    </div>
  );
}

// Status badge moved to components/shared/VitIdStatusBadge.tsx (used by both
// this page and the Has VIT ID? page).

function BioEmailPill({
  status,
  sentAt,
  targetAcademicYear,
}: {
  status: BioEmailStatus;
  sentAt: string | null;
  targetAcademicYear: string | null;
}) {
  if (status === 'none') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
        title="No bio & project description email on record for this fellowship year"
      >
        —
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700"
        title={
          targetAcademicYear
            ? `Bio email queued for ${targetAcademicYear} — will be sent by the daily cron`
            : 'Bio email queued — will be sent by the daily cron'
        }
      >
        Pending
      </span>
    );
  }
  if (status === 'sent') {
    const label = sentAt
      ? `Sent ${new Date(sentAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}`
      : 'Sent';
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700"
        title={
          targetAcademicYear
            ? `Bio email sent for ${targetAcademicYear}${sentAt ? ` on ${new Date(sentAt).toLocaleString()}` : ''}`
            : sentAt
              ? `Bio email sent on ${new Date(sentAt).toLocaleString()}`
              : 'Bio email sent'
        }
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
      title="Last bio email attempt failed — use the send button to retry"
    >
      Failed
    </span>
  );
}

const BIO_EMAIL_ERROR_MESSAGES: Record<SendBioEmailReason, string> = {
  no_vit_id: 'This appointee has not claimed a VIT ID yet.',
  no_matching_fellowship: 'No current or upcoming fellowship matches the requested year.',
  fellowship_not_accepted: 'The fellowship for the target year is not marked as accepted.',
  no_primary_email: 'No primary email is on file for this appointee.',
  already_sent: 'The bio email has already been sent for this fellowship year.',
};

const VIT_ID_EMAIL_ERROR_MESSAGES: Record<SendVitIdEmailReason, string> = {
  no_matching_fellowship: 'No current or upcoming fellowship matches the requested year.',
  fellowship_not_accepted: 'The fellowship for the target year is not marked as accepted.',
  no_primary_email: 'No primary email is on file for this appointee.',
  missing_first_name: 'This appointee is missing a first name in CiviCRM. Update the record and try again.',
  already_has_vit_id: 'This appointee already has a VIT ID. Use the bio email flow instead.',
  needs_review: 'Resolve the VIT ID Status data conflict before sending.',
  already_sent: 'The VIT ID invitation has already been sent for this fellowship year.',
  civicrm_unavailable: 'CiviCRM is temporarily unavailable. Try again in a moment.',
};

function formatLabel(value?: string): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortField =
  | 'name'
  | 'appointment'
  | 'email'
  | 'fellowship'
  | 'appointeeStatus'
  | 'status'
  | 'bioEmail';
type SortDir = 'asc' | 'desc';
const FELLOWS_PER_PAGE = 25;

/**
 * Which email the preview modal is set up for. Null = closed.
 */
type ActiveSend = {
  fellow: FellowDashboardEntry;
  kind: 'vit_id_invitation' | 'bio_project_description';
};

function FellowsTable({ fellows }: { fellows: FellowDashboardEntry[] }) {
  // Default sort: appointment asc → lastName asc. Groups fellows by role type
  // (Fellow, Visiting Fellow, Visiting Professor, ...), then alphabetical
  // within each group. Amber/red badges carry the attention signal.
  const [sortField, setSortField] = useState<SortField>('appointment');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [activeSend, setActiveSend] = useState<ActiveSend | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendBioEmail = useSendBioEmail();
  const sendVitIdEmail = useSendVitIdEmail();
  const [pendingContactId, setPendingContactId] = useState<number | null>(null);

  // Preview fetches when modal is open; each open triggers a fresh preview.
  const previewQuery = useEmailPreview({
    contactId: activeSend?.fellow.civicrmId ?? null,
    type: (activeSend?.kind as EmailPreviewType) ?? 'bio_project_description',
    academicYear:
      (activeSend?.kind === 'vit_id_invitation'
        ? activeSend.fellow.vitIdInvitation.targetAcademicYear
        : activeSend?.fellow.bioEmail.targetAcademicYear) ?? null,
    enabled: activeSend !== null,
  });

  // Reset transient modal state when we open a new preview.
  useEffect(() => {
    if (activeSend) setSendError(null);
  }, [activeSend?.fellow.civicrmId, activeSend?.kind]);

  // Reset to page 1 when the underlying data changes (filter/search/year)
  useEffect(() => setPage(1), [fellows]);

  const sorted = useMemo(() => {
    return [...fellows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          break;
        case 'appointment':
          // Primary: appointment. Tie-break: lastName then firstName.
          cmp =
            (a.appointment || '').localeCompare(b.appointment || '') ||
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName);
          break;
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '');
          break;
        case 'fellowship':
          cmp = (a.fellowship || '').localeCompare(b.fellowship || '');
          break;
        case 'appointeeStatus': {
          // Order reflects the onboarding pipeline, not alphabetical labels.
          // Angela scans the column top-down and sees "what needs my attention
          // next" in flow order.
          const order: Record<
            FellowDashboardEntry['appointeeStatus'],
            number
          > = {
            nominated: 0,
            accepted: 1,
            'vit-id-sent': 2,
            'vit-id-claimed': 3,
            enrolled: 4,
          };
          cmp = order[a.appointeeStatus] - order[b.appointeeStatus];
          break;
        }
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'bioEmail': {
          // Semantic priority instead of alphabetic: actionable states first
          // (failed = needs retry, none = send candidate) so Angela sees rows
          // requiring attention at the top, then pending (in-flight), then
          // sent (already done). Lexicographic order would put "failed"
          // between "—" and "pending", which is confusing.
          const priority: Record<typeof a.bioEmail.status, number> = {
            failed: 0,
            none: 1,
            pending: 2,
            sent: 3,
          };
          cmp = priority[a.bioEmail.status] - priority[b.bioEmail.status];
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [fellows, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / FELLOWS_PER_PAGE);
  const paginated = sorted.slice((page - 1) * FELLOWS_PER_PAGE, page * FELLOWS_PER_PAGE);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleConfirmSend() {
    if (!activeSend) return;
    const { fellow, kind } = activeSend;
    const targetYear =
      kind === 'vit_id_invitation'
        ? fellow.vitIdInvitation.targetAcademicYear
        : fellow.bioEmail.targetAcademicYear;
    if (!targetYear) {
      setSendError('No target academic year available for this appointee.');
      return;
    }

    setPendingContactId(fellow.civicrmId);
    setSendError(null);
    try {
      if (kind === 'vit_id_invitation') {
        const result = await sendVitIdEmail.mutateAsync({
          contactId: fellow.civicrmId,
          academicYear: targetYear,
        });
        const label = `${fellow.firstName} ${fellow.lastName}`;
        if (result.status === 'SENT') {
          toast.success(`VIT ID invitation sent to ${label}.`);
        } else {
          toast.success(
            `VIT ID invitation queued for ${label} (status: ${result.status.toLowerCase()}).`
          );
        }
        setActiveSend(null);
      } else {
        const result = await sendBioEmail.mutateAsync({
          contactId: fellow.civicrmId,
          academicYear: targetYear,
        });
        const label = `${fellow.firstName} ${fellow.lastName}`;
        if (result.status === 'SENT') {
          toast.success(`Bio email sent to ${label}.`);
        } else {
          toast.success(
            `Bio email queued for ${label} (status: ${result.status.toLowerCase()}).`
          );
        }
        setActiveSend(null);
      }
    } catch (err) {
      // Inline error in the modal so Angela can retry without reopening;
      // this matches the design-review decision (inline banner > toast close).
      if (err instanceof SendVitIdEmailError) {
        setSendError(
          VIT_ID_EMAIL_ERROR_MESSAGES[err.reason] ||
            `Failed to send VIT ID invitation (${err.reason}).`
        );
      } else if (err instanceof SendBioEmailError) {
        setSendError(
          BIO_EMAIL_ERROR_MESSAGES[err.reason] ||
            `Failed to send bio email (${err.reason}).`
        );
      } else {
        setSendError(
          err instanceof Error ? err.message : 'Failed to send email.'
        );
      }
    } finally {
      setPendingContactId(null);
    }
  }

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    const ariaSort = sortField !== field ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending';

    return (
      <th
        aria-sort={ariaSort}
        className={`px-4 py-3 text-left ${className || ''}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="inline-flex select-none items-center text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {label}
          {sortField === field && (
            <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
          )}
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortHeader field="name" label="Name" />
              <SortHeader field="email" label="Email" className="hidden md:table-cell" />
              <SortHeader field="appointment" label="Appointment" className="hidden lg:table-cell" />
              <SortHeader field="fellowship" label="Fellowship Type" className="hidden lg:table-cell" />
              <SortHeader field="appointeeStatus" label="Appointee Status" />
              <SortHeader field="status" label="VIT ID Status" />
              <SortHeader field="bioEmail" label="Bio Email" />
              <th className="px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((fellow) => (
              <tr key={fellow.civicrmId} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                      {fellow.imageUrl ? (
                        <img src={fellow.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="text-xs font-medium text-primary">
                          {fellow.firstName?.[0]}{fellow.lastName?.[0]}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-[0.98rem] font-semibold">
                        {fellow.firstName} {fellow.lastName}
                      </div>
                      <div className="text-[0.82rem] leading-5 text-muted-foreground md:hidden">
                        {fellow.email || 'No email'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-[0.95rem] text-muted-foreground md:table-cell">
                  {fellow.email || (
                    <span className="italic text-muted-foreground/60">No email in CiviCRM</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-[0.95rem] text-muted-foreground lg:table-cell">
                  {formatLabel(fellow.appointment)}
                </td>
                <td className="hidden px-4 py-3 text-[0.95rem] text-muted-foreground lg:table-cell">
                  {formatLabel(fellow.fellowship)}
                </td>
                <td className="px-4 py-3">
                  <AppointeeStatusBadge
                    status={fellow.appointeeStatus}
                    subLabel={
                      fellow.vitIdInvitation.status === 'failed'
                        ? 'Last send failed'
                        : undefined
                    }
                    subLabelTone="destructive"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <VitIdStatusBadge
                      status={fellow.status}
                      matchedVia={fellow.matchedVia}
                      matched={fellow.matched}
                      matchedViaEmail={fellow.matchedViaEmail}
                      reason={fellow.reason}
                      candidates={fellow.candidates}
                    />
                    {fellow.status === 'active-different-email' && fellow.matched && (
                      <span className="text-[0.82rem] leading-5 text-muted-foreground">
                        VIT ID on file under:{' '}
                        <span className="font-mono break-all whitespace-normal">
                          {fellow.matched.email}
                        </span>
                      </span>
                    )}
                    {fellow.status === 'needs-review' && fellow.candidates && fellow.candidates.length > 0 && (
                      <ul className="mt-1 space-y-1 text-[0.82rem] leading-5 text-muted-foreground">
                        {fellow.candidates.map((c) => (
                          <li
                            key={c.userId}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                          >
                            <span className="font-mono break-all whitespace-normal">
                              {c.email}
                            </span>
                            {c.civicrmId && (
                              <span className="text-muted-foreground/70">
                                (civicrm_id: {c.civicrmId})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <BioEmailPill
                    status={fellow.bioEmail.status}
                    sentAt={fellow.bioEmail.sentAt}
                    targetAcademicYear={fellow.bioEmail.targetAcademicYear}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {fellow.vitIdInvitation.canManuallySend && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveSend({
                            fellow,
                            kind: 'vit_id_invitation',
                          })
                        }
                        disabled={pendingContactId === fellow.civicrmId}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        title={
                          fellow.vitIdInvitation.targetAcademicYear
                            ? `Send VIT ID invitation email for ${fellow.vitIdInvitation.targetAcademicYear}`
                            : 'Send VIT ID invitation email'
                        }
                      >
                        {pendingContactId === fellow.civicrmId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserPlus className="h-3 w-3" />
                        )}
                        <span>Send VIT ID email</span>
                      </button>
                    )}
                    {fellow.status === 'needs-review' &&
                      (fellow.appointeeStatus === 'accepted' ||
                        fellow.appointeeStatus === 'vit-id-claimed') && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-muted bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground"
                          title="Resolve the VIT ID Status data conflict before sending."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Send disabled
                        </span>
                      )}
                    {fellow.bioEmail.canManuallySend && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveSend({
                            fellow,
                            kind: 'bio_project_description',
                          })
                        }
                        disabled={pendingContactId === fellow.civicrmId}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        title={
                          fellow.bioEmail.targetAcademicYear
                            ? `Send bio & project description email for ${fellow.bioEmail.targetAcademicYear}`
                            : 'Send bio & project description email'
                        }
                      >
                        {pendingContactId === fellow.civicrmId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                        <span>Send bio email</span>
                      </button>
                    )}
                    {CIVICRM_URL && (
                      <a
                        href={`${CIVICRM_URL}/civicrm/contact/view?reset=1&cid=${fellow.civicrmId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        CiviCRM <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EmailPreviewModal
        open={activeSend !== null}
        onCancel={() => {
          if (pendingContactId !== null) return; // don't close mid-send
          setActiveSend(null);
          setSendError(null);
        }}
        onConfirm={handleConfirmSend}
        title={
          activeSend?.kind === 'vit_id_invitation'
            ? `Send VIT ID invitation to ${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`
            : activeSend
              ? `Send bio email to ${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`
              : ''
        }
        confirmLabel="Send email"
        preview={
          previewQuery.data
            ? {
                to: previewQuery.data.to,
                bcc: previewQuery.data.bcc,
                subject: previewQuery.data.subject,
                body: previewQuery.data.body,
                bodyFormat: previewQuery.data.bodyFormat,
              }
            : null
        }
        previewError={
          previewQuery.error
            ? previewQuery.error instanceof EmailPreviewError
              ? // Map preview-endpoint reason codes to the same human copy we
                // use for send errors. The template render errors (missing
                // firstName) are shared between preview and send.
                VIT_ID_EMAIL_ERROR_MESSAGES[
                  previewQuery.error.reason as SendVitIdEmailReason
                ] || BIO_EMAIL_ERROR_MESSAGES[
                  previewQuery.error.reason as SendBioEmailReason
                ] ||
                `Preview failed: ${previewQuery.error.reason}`
              : (previewQuery.error as Error).message
            : null
        }
        sendError={sendError}
        submitting={pendingContactId !== null}
      />
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * FELLOWS_PER_PAGE + 1}–{Math.min(page * FELLOWS_PER_PAGE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
