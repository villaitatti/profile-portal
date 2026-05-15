import { useState, useMemo, useEffect, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import { AppointeeStatusBadge } from '@/components/shared/AppointeeStatusBadge';
import { EmailPreviewModal } from '@/components/shared/EmailPreviewModal';
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
  type EmailPreviewReason,
  type EmailPreviewType,
} from '@/api/fellows';
import { useGenerateFormInvitation, useMarkNominationSent } from '@/api/forms';
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
  Repeat2,
  FileText,
  Copy,
  Check,
  MoreHorizontal,
  Info,
  CalendarCheck,
} from 'lucide-react';
import type {
  FellowDashboardEntry,
  VitIdStatus,
  BioEmailStatus,
  FormDef,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { getFormsForAppointmentType } from '@itatti/shared';

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
            className={`rounded-t-lg border-b-2 px-4 py-2.5 text-[1rem] font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[0.8rem] ${
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
            // Three distinct zero-row cases — previously the copy said "No
            // fellows match the current filters" even for a legitimately-
            // empty year, which misled Angela into thinking she had a stuck
            // filter when the data just wasn't there.
            searchQuery
              ? 'Try adjusting your search query.'
              : activeTab !== 'all'
                ? 'No fellows match this filter. Try "All" to see every appointee for this year.'
                : selectedYear
                  ? `No fellows on file for ${selectedYear}.`
                  : 'No fellows on file.'
          }
        />
      ) : (
        <FellowsTable fellows={filteredFellows} paginate={!selectedYear} />
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
            {/* 9 columns matches the real table: Name, Email, Appointment,
                Fellowship, Appointee Status, Form, VIT ID Status, Bio Email,
                Actions. Previously the skeleton used grid-cols-6 which
                caused a visible layout shift when data arrived. */}
            <div className="grid grid-cols-9 gap-4">
              {Array.from({ length: 9 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-3.5 rounded-full" />
              ))}
            </div>
          </div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-9 items-center gap-4 px-4 py-4">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="h-16 w-16 rounded-full bg-muted/80" />
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-28 rounded-full" />
                    <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                  </div>
                </div>
                {/* Middle columns = Email, Appointment, Fellowship,
                    Appointee Status, Form, VIT ID Status, Bio Email. Last cell
                    is Actions. */}
                {Array.from({ length: 7 }).map((__, column) => (
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
        <span className="text-[0.85rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={`mt-3 text-[2.1rem] font-semibold tracking-tight ${valueClassName || ''}`}>{value}</div>
    </div>
  );
}

// Status badge moved to components/shared/VitIdStatusBadge.tsx (used by both
// this page and the Has VIT ID? page).

function BioEmailPill({
  status,
  sentAt,
  sendCount,
  targetAcademicYear,
}: {
  status: BioEmailStatus;
  sentAt: string | null;
  sendCount: number;
  targetAcademicYear: string | null;
}) {
  if (status === 'none') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[0.8rem] font-medium text-muted-foreground"
        title="No bio & project description email on record for this fellowship year"
      >
        —
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-warning px-2.5 py-0.5 text-[0.8rem] font-medium text-warning-foreground"
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
    const verb = sendCount > 1 ? 'Re-sent' : 'Sent';
    const label = sentAt
      ? `${verb} ${new Date(sentAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}`
      : verb;
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-[0.8rem] font-medium text-green-700"
        title={
          targetAcademicYear
            ? `Bio email ${sendCount > 1 ? 're-sent' : 'sent'} for ${targetAcademicYear}${sentAt ? ` on ${new Date(sentAt).toLocaleString()}` : ''}`
            : sentAt
              ? `Bio email ${sendCount > 1 ? 're-sent' : 'sent'} on ${new Date(sentAt).toLocaleString()}`
              : `Bio email ${sendCount > 1 ? 're-sent' : 'sent'}`
        }
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[0.8rem] font-medium text-red-700"
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
  civicrm_unavailable: 'CiviCRM is temporarily unavailable. Try again in a moment.',
  email_send_failed: 'The email service rejected the message. Check SES configuration and sender verification, then try again.',
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
  email_send_failed: 'The email service rejected the message. Check SES configuration and sender verification, then try again.',
};

// Preview-specific reasons (contact_not_found is a 404 unique to the preview
// endpoint; civicrm_unavailable + no_primary_email + missing_first_name reuse
// the send-side copy but are repeated here so the Record is exhaustive and
// future reason additions surface as TS errors).
const EMAIL_PREVIEW_ERROR_MESSAGES: Record<EmailPreviewReason, string> = {
  missing_first_name: 'This appointee is missing a first name in CiviCRM. Update the record and try again.',
  no_primary_email: 'No primary email is on file for this appointee.',
  contact_not_found: 'This appointee no longer exists in CiviCRM — refresh the page and try again.',
  civicrm_unavailable: 'CiviCRM is temporarily unavailable. Try again in a moment.',
};

function formatLabel(value?: string): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  // "24 Apr 2026" — unambiguous for the EU/US mixed audience here.
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayInputValue(): string {
  // Seeds the picker with the admin's local calendar date. The server stores
  // the selected day at noon UTC to avoid timezone rollover in normal use.
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function getConfiguredForms(fellow: FellowDashboardEntry): FormDef[] {
  return getFormsForAppointmentType(fellow.appointment || '');
}

function getPrimaryConfiguredForm(fellow: FellowDashboardEntry): FormDef | null {
  // v0.13 intentionally handles one configured form per appointment type.
  // When a second form is added, render one status per configured form here.
  return getConfiguredForms(fellow)[0] ?? null;
}

function getFormInvitation(
  fellow: FellowDashboardEntry
): FormInvitationSummaryEntry | null {
  const form = getPrimaryConfiguredForm(fellow);
  if (!form) return null;
  return (
    fellow.formInvitations.find(
      (inv) =>
        inv.fellowshipId === fellow.fellowshipId &&
        inv.academicYear === fellow.fellowshipYear &&
        inv.formType === form.id &&
        (inv.status === 'pending' ||
          inv.status === 'submitted' ||
          inv.status === 'expired')
    ) ?? null
  );
}

type SortField =
  | 'name'
  | 'appointment'
  | 'email'
  | 'fellowship'
  | 'appointeeStatus'
  | 'form'
  | 'status'
  | 'bioEmail';
type SortDir = 'asc' | 'desc';
const FELLOWS_PER_PAGE = 50;

/**
 * Which email the preview modal is set up for. Null = closed.
 */
type ActiveSend = {
  fellow: FellowDashboardEntry;
  kind: 'vit_id_invitation' | 'bio_project_description';
  mode?: 'send' | 'resend';
};

type ActiveNominationSent = {
  fellow: FellowDashboardEntry;
  invitation: FormInvitationSummaryEntry;
};

function FellowsTable({ fellows, paginate }: { fellows: FellowDashboardEntry[]; paginate: boolean }) {
  // Default sort: appointment asc → lastName asc. Groups fellows by role type
  // (Fellow, Visiting Fellow, Visiting Professor, ...), then alphabetical
  // within each group. Amber/red badges carry the attention signal.
  const [sortField, setSortField] = useState<SortField>('appointment');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [activeSend, setActiveSend] = useState<ActiveSend | null>(null);
  const [activeNominationSent, setActiveNominationSent] =
    useState<ActiveNominationSent | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
  const sendBioEmail = useSendBioEmail();
  const sendVitIdEmail = useSendVitIdEmail();
  const markNominationSent = useMarkNominationSent();
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
    if (activeSend) {
      setSendError(null);
      setResendConfirmOpen(false);
    }
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
            'nomination-sent': 1,
            'form-submitted': 2,
            accepted: 3,
            'vit-id-sent': 4,
            'vit-id-claimed': 5,
            enrolled: 6,
          };
          cmp = order[a.appointeeStatus] - order[b.appointeeStatus];
          break;
        }
        case 'form': {
          const priority = (fellow: FellowDashboardEntry): number => {
            const invitation = getFormInvitation(fellow);
            if (!getPrimaryConfiguredForm(fellow)) return 5;
            if (!invitation) return 0;
            if (invitation.status === 'submitted') return 4;
            if (invitation.status === 'expired') return 3;
            if (invitation.nominationSentAt) return 2;
            return 1;
          };
          cmp = priority(a) - priority(b);
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

  const totalPages = paginate ? Math.ceil(sorted.length / FELLOWS_PER_PAGE) : 1;
  const paginated = paginate
    ? sorted.slice((page - 1) * FELLOWS_PER_PAGE, page * FELLOWS_PER_PAGE)
    : sorted;

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleConfirmSend() {
    if (activeSend?.kind === 'bio_project_description' && activeSend.mode === 'resend') {
      setResendConfirmOpen(true);
      return;
    }
    await sendActiveEmail();
  }

  async function sendActiveEmail() {
    if (!activeSend) return;
    const { fellow, kind, mode } = activeSend;
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
          resend: mode === 'resend',
        });
        const label = `${fellow.firstName} ${fellow.lastName}`;
        if (result.status === 'SENT') {
          toast.success(
            mode === 'resend'
              ? `Bio email re-sent to ${label}.`
              : `Bio email sent to ${label}.`
          );
        } else {
          toast.success(
            `${mode === 'resend' ? 'Bio email re-send' : 'Bio email'} queued for ${label} (status: ${result.status.toLowerCase()}).`
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

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-[1rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="email" label="Email" className="hidden md:table-cell" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="appointment" label="Appointment" className="hidden lg:table-cell" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="fellowship" label="Fellowship Type" className="hidden lg:table-cell" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="appointeeStatus" label="Appointee Status" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="form" label="Form" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="status" label="VIT ID Status" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="bioEmail" label="Bio Email" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <th className="px-4 py-3 text-center text-[0.75rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map((fellow) => (
              <FellowRow
                key={fellow.civicrmId}
                fellow={fellow}
                pendingContactId={pendingContactId}
                onSendClick={(kind, mode) => setActiveSend({ fellow, kind, mode })}
                onNominationSentClick={(invitation) =>
                  setActiveNominationSent({ fellow, invitation })
                }
              />
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
              ? `${activeSend.mode === 'resend' ? 'Re-send' : 'Send'} bio email to ${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`
              : ''
        }
        confirmLabel="Send email"
        notice={
          activeSend?.kind === 'bio_project_description' && activeSend.mode === 'resend'
            ? `This bio email was already sent${activeSend.fellow.bioEmail.sentAt ? ` on ${new Date(activeSend.fellow.bioEmail.sentAt).toLocaleDateString()}` : ''}. Review the email before re-sending it.`
            : null
        }
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
              ? EMAIL_PREVIEW_ERROR_MESSAGES[previewQuery.error.reason] ||
                `Preview failed: ${previewQuery.error.reason}`
              : (previewQuery.error as Error).message
            : null
        }
        sendError={sendError}
        submitting={pendingContactId !== null}
      />
      <NominationSentDialog
        open={activeNominationSent !== null}
        fellow={activeNominationSent?.fellow ?? null}
        submitting={markNominationSent.isPending}
        onCancel={() => {
          if (!markNominationSent.isPending) setActiveNominationSent(null);
        }}
        onConfirm={async (nominationSentOn) => {
          if (!activeNominationSent) return;
          try {
            await markNominationSent.mutateAsync({
              invitationId: activeNominationSent.invitation.id,
              nominationSentOn,
            });
            toast.success(
              `Nomination sent date saved for ${activeNominationSent.fellow.firstName} ${activeNominationSent.fellow.lastName}.`
            );
            setActiveNominationSent(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Failed to save nomination sent date.'
            );
          }
        }}
      />
      <ConfirmResendDialog
        open={resendConfirmOpen}
        fellowName={
          activeSend
            ? `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`
            : ''
        }
        submitting={pendingContactId !== null}
        onCancel={() => setResendConfirmOpen(false)}
        onConfirm={async () => {
          setResendConfirmOpen(false);
          await sendActiveEmail();
        }}
      />
      {paginate && totalPages > 1 && (
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

// Module-scope so it doesn't re-create on every FellowsTable render; takes
// sort state as props. Keeps the arrow-indicator + aria-sort logic in one place.
function SortHeader({
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
      className={`px-4 py-3 text-left ${className || ''}`}
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

function formLinkForToken(token: string): string {
  return `${window.location.origin}/forms/${token}`;
}

function formLinkCopiedMessage(fellow: FellowDashboardEntry): string {
  return `Form link for Appointee ${fellow.firstName} ${fellow.lastName} copied`;
}

function useCopyFormLink(fellow: FellowDashboardEntry) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  async function copyFormLink(
    token: string,
    options: {
      onCopyFailure?: () => void;
      failureMessage?: string;
    } = {}
  ): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(formLinkForToken(token));
      setCopied(true);
      toast.success(formLinkCopiedMessage(fellow));
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      if (options.onCopyFailure) {
        options.onCopyFailure();
      } else {
        toast.error(options.failureMessage ?? 'Failed to copy link.');
      }
      return false;
    }
  }

  return { copied, copyFormLink };
}

function CopyFormLinkButton({
  fellow,
  invitation,
}: {
  fellow: FellowDashboardEntry;
  invitation: FormInvitationSummaryEntry;
}) {
  const { copied, copyFormLink } = useCopyFormLink(fellow);

  return (
    <button
      type="button"
      onClick={() => {
        void copyFormLink(invitation.token);
      }}
      title="Copy form link"
      aria-label={`Copy form link for ${fellow.firstName} ${fellow.lastName}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

function FormStatusCell({ fellow }: { fellow: FellowDashboardEntry }) {
  const configuredForm = getPrimaryConfiguredForm(fellow);
  const invitation = getFormInvitation(fellow);

  let label = 'Ready';
  let tone = 'bg-muted text-muted-foreground';
  let description =
    'A form is configured for this appointment type. Generate the link, then paste it into Angela’s nomination email.';
  let subLabel: string | null = null;
  let canCopy = false;

  if (!configuredForm) {
    label = 'Not configured';
    tone = 'bg-red-50 text-red-700';
    description = `${formatLabel(fellow.appointment) || 'This appointment type'} has no Profile Portal form configured yet. Add a form mapping before generating links for this fellowship.`;
  } else if (invitation?.status === 'submitted') {
    label = 'Submitted';
    tone = 'bg-green-50 text-green-700';
    description =
      'The appointee submitted the form. The appointee lifecycle can now move to Form Submitted.';
    subLabel = invitation.submittedAt ? `on ${formatDate(invitation.submittedAt)}` : null;
  } else if (invitation?.status === 'expired') {
    label = 'Expired';
    tone = 'bg-muted text-muted-foreground';
    description =
      'This form link is expired. Reset or generate a new link before sending.';
  } else if (invitation?.nominationSentAt) {
    label = 'Waiting';
    tone = 'bg-amber-50 text-amber-700';
    description =
      'Angela marked the nomination email as sent. The portal is waiting for the appointee to submit the form.';
    subLabel = `sent ${formatDate(invitation.nominationSentAt)}`;
    canCopy = true;
  } else if (invitation) {
    label = 'Link Generated';
    tone = 'bg-slate-100 text-slate-700';
    description =
      'The private form link exists. Copy it into Angela’s nomination email, then mark Nomination sent from the Actions menu.';
    canCopy = true;
  }

  return (
    <div className="inline-flex items-start gap-1.5">
      <div className="flex flex-col items-start gap-1">
        <div className="inline-flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium ${tone}`}>
            {label}
          </span>
          {canCopy && invitation && (
            <CopyFormLinkButton fellow={fellow} invitation={invitation} />
          )}
        </div>
        {subLabel && (
          <span className="text-[0.82rem] leading-4 text-muted-foreground">
            {subLabel}
          </span>
        )}
      </div>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="View form status details"
            className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 w-72 rounded-lg border bg-card p-4 text-[0.88rem] leading-5 text-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
          >
            <div className="mb-1 font-semibold text-sm">Form Status</div>
            <p className="text-muted-foreground">{description}</p>
            {configuredForm && (
              <p className="mt-3 text-[0.82rem] text-muted-foreground">
                Configured form: {configuredForm.title}
              </p>
            )}
            <Popover.Arrow className="fill-card" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function FormLinkMenuItem({ fellow }: { fellow: FellowDashboardEntry }) {
  const generateMutation = useGenerateFormInvitation();
  const { copied, copyFormLink } = useCopyFormLink(fellow);
  const configuredForm = getPrimaryConfiguredForm(fellow);

  const existingInvitation = getFormInvitation(fellow);

  async function handleGenerate() {
    if (!configuredForm) return;
    let token: string;
    try {
      const result = await generateMutation.mutateAsync({
        fellowshipId: fellow.fellowshipId,
        contactId: fellow.civicrmId,
        academicYear: fellow.fellowshipYear,
        formType: configuredForm.id,
      });
      token = result.token;
    } catch {
      toast.error('Failed to generate form link.');
      return;
    }

    await copyFormLink(token, {
      onCopyFailure: () =>
        toast.success(
          `Form link generated for ${fellow.firstName} ${fellow.lastName}. Copy it from the button.`
        ),
    });
  }

  async function handleCopy() {
    if (!existingInvitation) return;
    await copyFormLink(existingInvitation.token);
  }

  if (!configuredForm) {
    return (
      <DropdownMenu.Item
        disabled
        className="flex cursor-default items-start gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground outline-none data-[disabled]:opacity-100"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <span className="flex flex-col">
          <span className="font-medium text-foreground">No form configured</span>
          <span className="text-xs leading-5">
            {formatLabel(fellow.appointment) || 'This appointment type'} has no form yet.
          </span>
        </span>
      </DropdownMenu.Item>
    );
  }

  if (existingInvitation?.status === 'submitted') {
    return (
      <DropdownMenu.Item
        disabled
        className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-green-700 outline-none data-[disabled]:opacity-100"
      >
        <Check className="h-4 w-4" />
        <span className="flex flex-col">
          <span className="font-medium">Form done</span>
          {existingInvitation.submittedAt && (
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(existingInvitation.submittedAt)}
            </span>
          )}
        </span>
      </DropdownMenu.Item>
    );
  }

  if (existingInvitation) {
    return (
      <DropdownMenu.Item
        onSelect={(event) => {
          event.preventDefault();
          void handleCopy();
        }}
        className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:bg-muted"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-700" />
        ) : (
          <Copy className="h-4 w-4 text-indigo-700" />
        )}
        <span>{copied ? 'Copied!' : 'Copy form link'}</span>
      </DropdownMenu.Item>
    );
  }

  return (
    <DropdownMenu.Item
      disabled={generateMutation.isPending}
      onSelect={(event) => {
        event.preventDefault();
        void handleGenerate();
      }}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    >
      {generateMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-indigo-700" />
      ) : (
        <FileText className="h-4 w-4 text-indigo-700" />
      )}
      <span>Generate form link</span>
    </DropdownMenu.Item>
  );
}

function FellowActionsMenu({
  fellow,
  isPending,
  onSendClick,
  onNominationSentClick,
}: {
  fellow: FellowDashboardEntry;
  isPending: boolean;
  onSendClick: (
    kind: 'vit_id_invitation' | 'bio_project_description',
    mode?: 'send' | 'resend'
  ) => void;
  onNominationSentClick: (invitation: FormInvitationSummaryEntry) => void;
}) {
  const formInvitation = getFormInvitation(fellow);
  const canMarkNominationSent =
    !!formInvitation &&
    formInvitation.status === 'pending' &&
    !formInvitation.nominationSentAt;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Open actions for ${fellow.firstName} ${fellow.lastName}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          collisionPadding={8}
          sideOffset={6}
          className="z-50 min-w-[15rem] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-1 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-1"
        >
          <FormLinkMenuItem fellow={fellow} />

          {canMarkNominationSent && (
            <DropdownMenu.Item
              disabled={isPending}
              onSelect={() => {
                if (formInvitation) onNominationSentClick(formInvitation);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>Nomination sent</span>
            </DropdownMenu.Item>
          )}

          {fellow.vitIdInvitation.canManuallySend && (
            <DropdownMenu.Item
              disabled={isPending}
              onSelect={() => onSendClick('vit_id_invitation')}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <UserPlus className="h-4 w-4 text-primary" />
              )}
              <span>Send VIT ID email</span>
            </DropdownMenu.Item>
          )}

          {fellow.status === 'needs-review' && (
            <DropdownMenu.Item
              disabled
              className="flex cursor-default items-start gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground outline-none data-[disabled]:opacity-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">Send disabled</span>
                <span className="text-xs leading-5">
                  Resolve the VIT ID status conflict first.
                </span>
              </span>
            </DropdownMenu.Item>
          )}

          {fellow.bioEmail.canManuallySend && (
            <DropdownMenu.Item
              disabled={isPending}
              onSelect={() => onSendClick('bio_project_description')}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span>Send bio email</span>
            </DropdownMenu.Item>
          )}

          {fellow.bioEmail.status === 'sent' && fellow.bioEmail.targetAcademicYear && (
            <DropdownMenu.Item
              disabled={isPending}
              onSelect={() => onSendClick('bio_project_description', 'resend')}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-900 outline-none transition-colors focus:bg-amber-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Repeat2 className="h-4 w-4" />
              )}
              <span>Re-send bio email</span>
            </DropdownMenu.Item>
          )}

          {CIVICRM_URL && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <a
                  href={`${CIVICRM_URL}/civicrm/contact/view?reset=1&cid=${fellow.civicrmId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary outline-none transition-colors focus:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in CiviCRM</span>
                </a>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FellowRow({
  fellow,
  pendingContactId,
  onSendClick,
  onNominationSentClick,
}: {
  fellow: FellowDashboardEntry;
  pendingContactId: number | null;
  onSendClick: (
    kind: 'vit_id_invitation' | 'bio_project_description',
    mode?: 'send' | 'resend'
  ) => void;
  onNominationSentClick: (invitation: FormInvitationSummaryEntry) => void;
}) {
  const isPending = pendingContactId === fellow.civicrmId;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
            {fellow.imageUrl ? (
              <img
                src={fellow.imageUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="text-base font-medium text-primary">
                {fellow.firstName?.[0]}
                {fellow.lastName?.[0]}
              </span>
            )}
          </div>
          <div>
            <div className="text-[1.08rem] font-semibold">
              {fellow.firstName} {fellow.lastName}
            </div>
            <div className="text-[0.88rem] leading-5 text-muted-foreground md:hidden">
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
        <FormStatusCell fellow={fellow} />
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
          {fellow.status === 'needs-review' &&
            fellow.candidates &&
            fellow.candidates.length > 0 && (
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
          sendCount={fellow.bioEmail.sendCount}
          targetAcademicYear={fellow.bioEmail.targetAcademicYear}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <FellowActionsMenu
          fellow={fellow}
          isPending={isPending}
          onSendClick={onSendClick}
          onNominationSentClick={onNominationSentClick}
        />
      </td>
    </tr>
  );
}

function ConfirmResendDialog({
  open,
  fellowName,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fellowName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(29,37,44,0.38)] px-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-resend-title"
        className="w-full max-w-md rounded-lg border bg-card shadow-lg"
      >
        <div className="border-b px-5 py-4">
          <h2
            id="confirm-resend-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Re-send bio email?
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-[0.95rem] leading-6 text-muted-foreground">
          <p>
            This bio email has already been sent to {fellowName}. Sending again
            will deliver another copy to the recipient.
          </p>
          <p className="font-medium text-foreground">
            Are you sure you want to send it again?
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send again
          </button>
        </div>
      </div>
    </div>
  );
}

function NominationSentDialog({
  open,
  fellow,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fellow: FellowDashboardEntry | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (nominationSentOn: string) => Promise<void> | void;
}) {
  const [nominationSentOn, setNominationSentOn] = useState(todayInputValue());

  useEffect(() => {
    if (open) setNominationSentOn(todayInputValue());
  }, [open, fellow?.civicrmId]);

  const fellowName = fellow ? `${fellow.firstName} ${fellow.lastName}` : '';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[rgba(29,37,44,0.38)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150" />
        <Dialog.Content
          aria-labelledby="nomination-sent-title"
          className="fixed left-1/2 top-1/2 z-[61] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-150"
        >
          <div className="border-b px-5 py-4">
            <Dialog.Title
              id="nomination-sent-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Nomination sent
            </Dialog.Title>
          </div>
          {fellow && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onConfirm(nominationSentOn);
              }}
            >
              <div className="space-y-4 px-5 py-4">
                <p className="text-[0.95rem] leading-6 text-muted-foreground">
                  Record when the nomination email was sent to {fellowName}. The
                  appointee status will move forward and the form will show as
                  waiting for submission.
                </p>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Nomination sent on
                  </span>
                  <input
                    type="date"
                    lang="en-GB"
                    value={nominationSentOn}
                    onChange={(event) => setNominationSentOn(event.target.value)}
                    required
                    className="w-full rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t px-5 py-4">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submitting}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
