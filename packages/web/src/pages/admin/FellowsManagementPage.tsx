import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import { AppointeeStatusBadge } from '@/components/shared/AppointeeStatusBadge';
import { EmailPreviewModal } from '@/components/shared/EmailPreviewModal';
import { SelectDropdown } from '@/components/shared/SelectDropdown';
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
import { getCivicrmUrl } from '@/config/runtime';
import { formatHumanDate, formatHumanDateTime } from '@/lib/dates';
import { getCurrentAcademicYear } from './utils/academic-year';
import {
  Users,
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
  X,
} from 'lucide-react';
import type {
  FellowDashboardEntry,
  AppointmentCategory,
  AppointeeStatus,
  BioEmailStatus,
  VitIdStatus,
  FormDef,
  FormInvitationSummaryEntry,
} from '@itatti/shared';
import { getFormsForFellowship } from '@itatti/shared';

type FilterTab = 'all' | AppointmentCategory;

const APPOINTMENT_TABS: { key: FilterTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'fellows.tabs.all' },
  { key: 'full-year-fellow', labelKey: 'fellows.tabs.fullYearFellow' },
  { key: 'term-fellow', labelKey: 'fellows.tabs.termFellow' },
  { key: 'visiting-professor', labelKey: 'fellows.tabs.visitingProfessor' },
  { key: 'artist-in-residence', labelKey: 'fellows.tabs.artistInResidence' },
  { key: 'directors-appointment', labelKey: 'fellows.tabs.directorsAppointment' },
  { key: 'post-doctoral', labelKey: 'fellows.tabs.postDoctoral' },
  { key: 'research-associate', labelKey: 'fellows.tabs.researchAssociate' },
];

const STATUS_PILLS: { key: AppointeeStatus; labelKey: string; tone: string }[] = [
  { key: 'nominated', labelKey: 'fellows.status.nominated', tone: 'bg-muted text-foreground' },
  { key: 'nomination-sent', labelKey: 'fellows.status.nominationSent', tone: 'bg-muted text-muted-foreground' },
  { key: 'form-submitted', labelKey: 'fellows.status.formSubmitted', tone: 'bg-indigo-50 text-indigo-700' },
  { key: 'accepted', labelKey: 'fellows.status.accepted', tone: 'bg-blue-50 text-blue-700' },
  { key: 'vit-id-sent', labelKey: 'fellows.status.vitIdSent', tone: 'bg-amber-50 text-amber-700' },
  { key: 'vit-id-claimed', labelKey: 'fellows.status.vitIdClaimed', tone: 'bg-lime-50 text-lime-700' },
  { key: 'enrolled', labelKey: 'fellows.status.enrolled', tone: 'bg-green-50 text-green-700' },
];

const VIT_ID_PILLS: { key: VitIdStatus; labelKey: string; tone: string }[] = [
  { key: 'active', labelKey: 'fellows.filters.vitPills.active', tone: 'bg-green-50 text-green-700' },
  { key: 'active-different-email', labelKey: 'fellows.filters.vitPills.differentEmail', tone: 'bg-amber-50 text-amber-700' },
  { key: 'needs-review', labelKey: 'fellows.filters.vitPills.needsReview', tone: 'bg-amber-50 text-amber-800' },
  { key: 'no-account', labelKey: 'fellows.filters.vitPills.noAccount', tone: 'bg-red-50 text-red-700' },
];

export function FellowsManagementPage() {
  const { t } = useTranslation();
  const currentYear = getCurrentAcademicYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<AppointeeStatus[]>([]);
  const [selectedVitIdStatuses, setSelectedVitIdStatuses] = useState<VitIdStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useFellowsDashboard(selectedYear || undefined);

  const fellowsByTab = useMemo(() => {
    if (!data) return [];
    if (activeTab === 'all') return data.fellows;
    return data.fellows.filter((f) => f.appointmentCategory === activeTab);
  }, [data, activeTab]);

  const filteredFellows = useMemo(() => {
    let fellows = fellowsByTab;

    // Filter by selected status pills
    if (selectedStatuses.length > 0) {
      fellows = fellows.filter((f) => selectedStatuses.includes(f.appointeeStatus));
    }

    // Filter by selected VIT ID status pills
    if (selectedVitIdStatuses.length > 0) {
      fellows = fellows.filter((f) => selectedVitIdStatuses.includes(f.status));
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
  }, [fellowsByTab, selectedStatuses, selectedVitIdStatuses, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<AppointeeStatus, number> = {
      nominated: 0,
      'nomination-sent': 0,
      'form-submitted': 0,
      accepted: 0,
      'vit-id-sent': 0,
      'vit-id-claimed': 0,
      enrolled: 0,
    };
    for (const f of fellowsByTab) {
      counts[f.appointeeStatus]++;
    }
    return counts;
  }, [fellowsByTab]);

  const vitIdStatusCounts = useMemo(() => {
    const counts: Record<VitIdStatus, number> = {
      active: 0,
      'active-different-email': 0,
      'needs-review': 0,
      'no-account': 0,
    };
    for (const f of fellowsByTab) {
      counts[f.status]++;
    }
    return counts;
  }, [fellowsByTab]);

  const tabCounts = useMemo(() => {
    if (!data) return {} as Record<FilterTab, number>;
    const counts: Record<string, number> = { all: data.fellows.length };
    for (const f of data.fellows) {
      if (f.appointmentCategory) {
        counts[f.appointmentCategory] = (counts[f.appointmentCategory] || 0) + 1;
      }
    }
    return counts as Record<FilterTab, number>;
  }, [data]);

  function toggleStatus(status: AppointeeStatus) {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }

  function toggleVitIdStatus(status: VitIdStatus) {
    setSelectedVitIdStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }

  if (isLoading) return <FellowsManagementSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader
          title={t('fellows.manage.title')}
          description={t('fellows.manage.description')}
        />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">{t('fellows.manage.loadFailed')}</h3>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : t('fellows.manage.unexpectedError')}
          </p>
        </div>
      </div>
    );
  }

  const academicYears = data?.academicYears ?? [];

  return (
    <div className="px-2 sm:px-4">
      <PageHeader
        title={t('fellows.manage.title')}
        description={t('fellows.manage.description')}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-[1.25rem] font-semibold tracking-tight text-foreground">
          {t('fellows.manage.yearAppointees', { year: selectedYear })}
        </h2>
        <SelectDropdown
          ariaLabel={t('fellows.manage.academicYear')}
          options={(academicYears.length > 0 ? academicYears : [currentYear]).map((year) => ({
            value: year,
            label: year,
          }))}
          value={selectedYear}
          allowEmpty={false}
          onSelect={(year) => {
            setSelectedYear(year);
            setActiveTab('all');
            setSelectedStatuses([]);
            setSelectedVitIdStatuses([]);
            setSearchQuery('');
          }}
          placeholder={currentYear}
          className="min-w-[150px]"
        />
      </div>

      {/* Appointment Type Tabs */}
      <div className="mb-4 overflow-x-auto border-b">
        <div className="flex gap-1 min-w-max">
          {APPOINTMENT_TABS.map((tab) => (
            <button
              key={tab.key}
              aria-pressed={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedStatuses([]);
                setSelectedVitIdStatuses([]);
              }}
              className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-[0.9rem] font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(tab.labelKey)}
              <span
                className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.75rem] ${
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters Card */}
      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t('fellows.filters.title')}</h3>
          {(selectedStatuses.length > 0 || selectedVitIdStatuses.length > 0) && (
            <button
              onClick={() => {
                setSelectedStatuses([]);
                setSelectedVitIdStatuses([]);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              {t('fellows.filters.clear')}
            </button>
          )}
        </div>

        <div className="mb-3">
          <span className="mb-1.5 block text-[0.75rem] font-medium text-muted-foreground">
            {t('fellows.filters.appointeeStatus')}
          </span>
          <div className="flex flex-wrap gap-2">
            {STATUS_PILLS.map((pill) => {
              const isActive = selectedStatuses.includes(pill.key);
              return (
                <button
                  key={pill.key}
                  aria-pressed={isActive}
                  onClick={() => toggleStatus(pill.key)}
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.8rem] font-medium transition-colors ${
                    isActive ? pill.tone : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(pill.labelKey)} ({statusCounts[pill.key]})
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[0.75rem] font-medium text-muted-foreground">
            {t('fellows.filters.vitIdStatus')}
          </span>
          <div className="flex flex-wrap gap-2">
            {VIT_ID_PILLS.map((pill) => {
              const isActive = selectedVitIdStatuses.includes(pill.key);
              return (
                <button
                  key={pill.key}
                  aria-pressed={isActive}
                  onClick={() => toggleVitIdStatus(pill.key)}
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.8rem] font-medium transition-colors ${
                    isActive ? pill.tone : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(pill.labelKey)} ({vitIdStatusCounts[pill.key]})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('fellows.manage.searchPlaceholder')}
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
          title={t('fellows.manage.emptyTitle')}
          description={
            searchQuery && (selectedStatuses.length > 0 || selectedVitIdStatuses.length > 0 || activeTab !== 'all')
              ? t('fellows.manage.emptyAdjustSearchOrFilters')
              : searchQuery
                ? t('fellows.manage.emptyAdjustSearch')
                : selectedStatuses.length > 0 || selectedVitIdStatuses.length > 0 || activeTab !== 'all'
                  ? t('fellows.manage.emptyNoMatchFilters')
                  : t('fellows.manage.emptyNoneForYear', { year: selectedYear })
          }
        />
      ) : (
        <FellowsTable fellows={filteredFellows} paginate={false} />
      )}
    </div>
  );
}

function FellowsManagementSkeleton() {
  return (
    <div className="space-y-6 px-2 sm:px-4 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-64 rounded-full" />
        <SkeletonBlock className="h-5 w-[28rem] max-w-full rounded-full" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 border-b pb-0.5 overflow-x-auto">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-10 w-28 flex-shrink-0 rounded-t-lg" />
        ))}
      </div>

      {/* Status pills skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      {/* Search skeleton */}
      <SkeletonBlock className="h-11 w-full rounded-md" />

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/50 px-3 py-3">
          <div className="grid grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3.5 rounded-full" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-8 items-center gap-3 px-3 py-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-16 w-16 rounded-full bg-muted/80" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-28 rounded-full" />
                  <SkeletonBlock className="h-3 w-36 rounded-full" />
                </div>
              </div>
              {Array.from({ length: 6 }).map((__, column) => (
                <SkeletonBlock key={column} className="h-4 w-20 rounded-full" />
              ))}
              <SkeletonBlock className="h-4 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>
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
  const { t, i18n } = useTranslation();
  if (status === 'none') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[0.8rem] font-medium text-muted-foreground"
        title={t('fellows.bioEmail.noneTitle')}
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
            ? t('fellows.bioEmail.pendingTitleYear', { year: targetAcademicYear })
            : t('fellows.bioEmail.pendingTitle')
        }
      >
        {t('fellows.bioEmail.pending')}
      </span>
    );
  }
  if (status === 'sent') {
    const resent = sendCount > 1;
    const label = sentAt
      ? t(resent ? 'fellows.bioEmail.resentOn' : 'fellows.bioEmail.sentOn', {
          date: formatHumanDate(sentAt, i18n.language),
        })
      : t(resent ? 'fellows.bioEmail.resent' : 'fellows.bioEmail.sent');
    const sentDateTime = sentAt ? formatHumanDateTime(sentAt, i18n.language) : null;
    const title = targetAcademicYear
      ? sentDateTime
        ? t(resent ? 'fellows.bioEmail.titleResentYearOn' : 'fellows.bioEmail.titleSentYearOn', {
            year: targetAcademicYear,
            date: sentDateTime,
          })
        : t(resent ? 'fellows.bioEmail.titleResentYear' : 'fellows.bioEmail.titleSentYear', {
            year: targetAcademicYear,
          })
      : sentDateTime
        ? t(resent ? 'fellows.bioEmail.titleResentOn' : 'fellows.bioEmail.titleSentOn', {
            date: sentDateTime,
          })
        : t(resent ? 'fellows.bioEmail.titleResent' : 'fellows.bioEmail.titleSent');
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-[0.8rem] font-medium text-green-700"
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[0.8rem] font-medium text-red-700"
      title={t('fellows.bioEmail.failedTitle')}
    >
      {t('fellows.bioEmail.failed')}
    </span>
  );
}

// Reason → i18n key maps; translated with t() at usage time so the copy
// follows the active language.
const BIO_EMAIL_ERROR_KEYS: Record<SendBioEmailReason, string> = {
  no_vit_id: 'fellows.errors.noVitId',
  no_matching_fellowship: 'fellows.errors.noMatchingFellowship',
  fellowship_not_accepted: 'fellows.errors.fellowshipNotAccepted',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  already_sent: 'fellows.errors.bioAlreadySent',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
  email_send_failed: 'fellows.errors.emailSendFailed',
};

const VIT_ID_EMAIL_ERROR_KEYS: Record<SendVitIdEmailReason, string> = {
  no_matching_fellowship: 'fellows.errors.noMatchingFellowship',
  fellowship_not_accepted: 'fellows.errors.fellowshipNotAccepted',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  missing_first_name: 'fellows.errors.missingFirstName',
  already_has_vit_id: 'fellows.errors.alreadyHasVitId',
  needs_review: 'fellows.errors.needsReview',
  already_sent: 'fellows.errors.vitIdAlreadySent',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
  email_send_failed: 'fellows.errors.emailSendFailed',
};

// Preview-specific reasons (contact_not_found is a 404 unique to the preview
// endpoint; civicrm_unavailable + no_primary_email + missing_first_name reuse
// the send-side copy but are repeated here so the Record is exhaustive and
// future reason additions surface as TS errors).
const EMAIL_PREVIEW_ERROR_KEYS: Record<EmailPreviewReason, string> = {
  missing_first_name: 'fellows.errors.missingFirstName',
  no_primary_email: 'fellows.errors.noPrimaryEmail',
  contact_not_found: 'fellows.errors.contactNotFound',
  civicrm_unavailable: 'fellows.errors.civicrmUnavailable',
};

function formatLabel(value?: string): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
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
  return getFormsForFellowship(fellow.appointment || '', fellow.fellowship);
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
  const { t, i18n } = useTranslation();
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
  }, [activeSend]);

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
          cmp =
            (a.appointment || '').localeCompare(b.appointment || '') ||
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName);
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
      setSendError(t('fellows.send.noTargetYear'));
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
          toast.success(t('fellows.send.vitIdSentTo', { name: label }));
        } else {
          toast.success(
            t('fellows.send.vitIdQueued', {
              name: label,
              status: result.status.toLowerCase(),
            })
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
              ? t('fellows.send.bioResentTo', { name: label })
              : t('fellows.send.bioSentTo', { name: label })
          );
        } else {
          toast.success(
            t(mode === 'resend' ? 'fellows.send.bioResendQueued' : 'fellows.send.bioQueued', {
              name: label,
              status: result.status.toLowerCase(),
            })
          );
        }
        setActiveSend(null);
      }
    } catch (err) {
      // Inline error in the modal so Angela can retry without reopening;
      // this matches the design-review decision (inline banner > toast close).
      if (err instanceof SendVitIdEmailError) {
        setSendError(
          VIT_ID_EMAIL_ERROR_KEYS[err.reason]
            ? t(VIT_ID_EMAIL_ERROR_KEYS[err.reason])
            : t('fellows.send.vitIdFailedFallback', { reason: err.reason })
        );
      } else if (err instanceof SendBioEmailError) {
        setSendError(
          BIO_EMAIL_ERROR_KEYS[err.reason]
            ? t(BIO_EMAIL_ERROR_KEYS[err.reason])
            : t('fellows.send.bioFailedFallback', { reason: err.reason })
        );
      } else {
        setSendError(
          err instanceof Error ? err.message : t('fellows.send.genericFailed')
        );
      }
    } finally {
      setPendingContactId(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" tabIndex={0} role="region" aria-label={t('fellows.manage.tableAria')}>
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortHeader field="name" label={t('fellows.table.name')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="appointeeStatus" label={t('fellows.table.appointeeStatus')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="appointment" label={t('fellows.table.appointment')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="fellowship" label={t('fellows.table.fellowshipType')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="form" label={t('fellows.table.form')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="status" label={t('fellows.table.vitIdStatus')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <SortHeader field="bioEmail" label={t('fellows.table.bioEmail')} sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />
              <th className="px-3 py-3 text-center text-[0.75rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t('fellows.table.actions')}
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
            ? t('fellows.send.vitIdTitle', {
                name: `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}`,
              })
            : activeSend
              ? t(
                  activeSend.mode === 'resend'
                    ? 'fellows.send.bioResendTitle'
                    : 'fellows.send.bioTitle',
                  { name: `${activeSend.fellow.firstName} ${activeSend.fellow.lastName}` }
                )
              : ''
        }
        confirmLabel={t('fellows.send.confirm')}
        notice={
          activeSend?.kind === 'bio_project_description' && activeSend.mode === 'resend'
            ? activeSend.fellow.bioEmail.sentAt
              ? t('fellows.send.resendNoticeDate', {
                  date: formatHumanDate(activeSend.fellow.bioEmail.sentAt, i18n.language),
                })
              : t('fellows.send.resendNotice')
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
              ? EMAIL_PREVIEW_ERROR_KEYS[previewQuery.error.reason]
                ? t(EMAIL_PREVIEW_ERROR_KEYS[previewQuery.error.reason])
                : t('fellows.send.previewFailedFallback', {
                    reason: previewQuery.error.reason,
                  })
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
              t('fellows.dialogs.nominationSaved', {
                name: `${activeNominationSent.fellow.firstName} ${activeNominationSent.fellow.lastName}`,
              })
            );
            setActiveNominationSent(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : t('fellows.errors.saveNominationFailed')
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
            {t('fellows.table.showing', {
              from: (page - 1) * FELLOWS_PER_PAGE + 1,
              to: Math.min(page * FELLOWS_PER_PAGE, sorted.length),
              total: sorted.length,
            })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('fellows.table.previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('fellows.table.next')}
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

function formLinkForToken(token: string): string {
  return `${window.location.origin}/forms/${token}`;
}

function useCopyFormLink(fellow: FellowDashboardEntry) {
  const { t } = useTranslation();
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
      toast.success(
        t('fellows.form.linkCopied', {
          name: `${fellow.firstName} ${fellow.lastName}`,
        })
      );
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      if (options.onCopyFailure) {
        options.onCopyFailure();
      } else {
        toast.error(options.failureMessage ?? t('fellows.form.copyFailed'));
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
  const { t } = useTranslation();
  const { copied, copyFormLink } = useCopyFormLink(fellow);

  return (
    <button
      type="button"
      onClick={() => {
        void copyFormLink(invitation.token);
      }}
      title={t('fellows.form.copyLink')}
      aria-label={t('fellows.form.copyLinkAria', {
        name: `${fellow.firstName} ${fellow.lastName}`,
      })}
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
  const { t, i18n } = useTranslation();
  const configuredForm = getPrimaryConfiguredForm(fellow);
  const invitation = getFormInvitation(fellow);

  let label = t('fellows.form.ready');
  let tone = 'bg-muted text-muted-foreground';
  let description = t('fellows.form.readyDescription');
  let subLabel: string | null = null;
  let canCopy = false;

  if (!configuredForm) {
    label = t('fellows.form.notConfigured');
    tone = 'bg-red-50 text-red-700';
    description = t('fellows.form.notConfiguredDescription', {
      appointment: formatLabel(fellow.appointment) || t('fellows.form.thisAppointmentType'),
    });
  } else if (invitation?.status === 'submitted') {
    label = t('fellows.form.submitted');
    tone = 'bg-green-50 text-green-700';
    description = t('fellows.form.submittedDescription');
    subLabel = invitation.submittedAt
      ? t('fellows.form.onDate', {
          date: formatHumanDate(invitation.submittedAt, i18n.language),
        })
      : null;
  } else if (invitation?.status === 'expired') {
    label = t('fellows.form.expired');
    tone = 'bg-muted text-muted-foreground';
    description = t('fellows.form.expiredDescription');
  } else if (invitation?.nominationSentAt) {
    label = t('fellows.form.waiting');
    tone = 'bg-amber-50 text-amber-700';
    description = t('fellows.form.waitingDescription');
    subLabel = t('fellows.form.sentDate', {
      date: formatHumanDate(invitation.nominationSentAt, i18n.language),
    });
    canCopy = true;
  } else if (invitation) {
    label = t('fellows.form.linkGenerated');
    tone = 'bg-muted text-muted-foreground';
    description = t('fellows.form.linkGeneratedDescription');
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
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t('fellows.form.statusPopoverAria')}
              className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          }
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          sideOffset={6}
          className="block w-72 gap-0 rounded-lg border bg-card p-4 text-[0.88rem] leading-5 text-foreground shadow-lg"
        >
          <div className="mb-1 font-semibold text-sm">{t('fellows.form.statusPopoverTitle')}</div>
          <p className="text-muted-foreground">{description}</p>
          {configuredForm && (
            <p className="mt-3 text-[0.82rem] text-muted-foreground">
              {t('fellows.form.configuredForm', { title: configuredForm.title })}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FormLinkMenuItem({ fellow }: { fellow: FellowDashboardEntry }) {
  const { t, i18n } = useTranslation();
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
      toast.error(t('fellows.form.generateFailed'));
      return;
    }

    await copyFormLink(token, {
      onCopyFailure: () =>
        toast.success(
          t('fellows.form.generatedCopyManually', {
            name: `${fellow.firstName} ${fellow.lastName}`,
          })
        ),
    });
  }

  async function handleCopy() {
    if (!existingInvitation) return;
    await copyFormLink(existingInvitation.token);
  }

  if (!configuredForm) {
    return (
      <DropdownMenuItem
        disabled
        className="cursor-default items-start px-3 text-muted-foreground data-[disabled]:opacity-100"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
        <span className="flex flex-col">
          <span className="font-medium text-foreground">{t('fellows.form.noFormConfigured')}</span>
          <span className="text-xs leading-5">
            {t('fellows.form.noFormYet', {
              appointment:
                formatLabel(fellow.appointment) || t('fellows.form.thisAppointmentType'),
            })}
          </span>
        </span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation?.status === 'submitted') {
    return (
      <DropdownMenuItem
        disabled
        className="cursor-default px-3 text-green-700 data-[disabled]:opacity-100"
      >
        <Check className="h-4 w-4" />
        <span className="flex flex-col">
          <span className="font-medium">{t('fellows.form.formDone')}</span>
          {existingInvitation.submittedAt && (
            <span className="text-xs text-muted-foreground">
              {t('fellows.form.submittedOn', {
                date: formatHumanDate(existingInvitation.submittedAt, i18n.language),
              })}
            </span>
          )}
        </span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation?.status === 'expired') {
    return (
      <DropdownMenuItem
        disabled={generateMutation.isPending}
        closeOnClick={false}
        onClick={() => {
          void handleGenerate();
        }}
        className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
      >
        {generateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-indigo-700" />
        ) : (
          <Repeat2 className="h-4 w-4 text-indigo-700" />
        )}
        <span>{t('fellows.form.generateNewLink')}</span>
      </DropdownMenuItem>
    );
  }

  if (existingInvitation) {
    return (
      <DropdownMenuItem
        closeOnClick={false}
        onClick={() => {
          void handleCopy();
        }}
        className="px-3 font-medium text-foreground"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-700" />
        ) : (
          <Copy className="h-4 w-4 text-indigo-700" />
        )}
        <span>{copied ? t('fellows.form.copied') : t('fellows.form.copyLink')}</span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      disabled={generateMutation.isPending}
      closeOnClick={false}
      onClick={() => {
        void handleGenerate();
      }}
      className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    >
      {generateMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-indigo-700" />
      ) : (
        <FileText className="h-4 w-4 text-indigo-700" />
      )}
      <span>{t('fellows.form.generateLink')}</span>
    </DropdownMenuItem>
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
  const { t } = useTranslation();
  const formInvitation = getFormInvitation(fellow);
  const civicrmUrl = getCivicrmUrl();
  const canMarkNominationSent =
    !!formInvitation &&
    formInvitation.status === 'pending' &&
    !formInvitation.nominationSentAt;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t('fellows.actions.openMenuAria', {
              name: `${fellow.firstName} ${fellow.lastName}`,
            })}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[15rem]">
          <FormLinkMenuItem fellow={fellow} />

          {canMarkNominationSent && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => {
                if (formInvitation) onNominationSentClick(formInvitation);
              }}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>{t('fellows.actions.nominationSent')}</span>
            </DropdownMenuItem>
          )}

          {fellow.vitIdInvitation.canManuallySend && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('vit_id_invitation')}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <UserPlus className="h-4 w-4 text-primary" />
              )}
              <span>{t('fellows.actions.sendVitIdEmail')}</span>
            </DropdownMenuItem>
          )}

          {fellow.status === 'needs-review' && (
            <DropdownMenuItem
              disabled
              className="cursor-default items-start px-3 text-muted-foreground data-[disabled]:opacity-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t('fellows.actions.sendDisabled')}</span>
                <span className="text-xs leading-5">
                  {t('fellows.actions.resolveConflictFirst')}
                </span>
              </span>
            </DropdownMenuItem>
          )}

          {fellow.bioEmail.canManuallySend && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('bio_project_description')}
              className="px-3 font-medium text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span>{t('fellows.actions.sendBioEmail')}</span>
            </DropdownMenuItem>
          )}

          {fellow.bioEmail.status === 'sent' && fellow.bioEmail.targetAcademicYear && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => onSendClick('bio_project_description', 'resend')}
              className="px-3 font-medium text-amber-900 data-highlighted:bg-amber-50 data-highlighted:text-amber-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:text-amber-500 dark:data-highlighted:bg-amber-950 dark:data-highlighted:text-amber-500"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Repeat2 className="h-4 w-4" />
              )}
              <span>{t('fellows.actions.resendBioEmail')}</span>
            </DropdownMenuItem>
          )}

          {civicrmUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <a
                    href={`${civicrmUrl}/civicrm/contact/view?reset=1&cid=${fellow.civicrmId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                className="px-3 font-medium text-primary data-highlighted:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{t('fellows.actions.openInCivicrm')}</span>
              </DropdownMenuItem>
            </>
          )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { t } = useTranslation();
  const isPending = pendingContactId === fellow.civicrmId;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-3">
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
          <div className="min-w-0">
            <div className="whitespace-nowrap text-[1rem] font-semibold">
              {fellow.firstName} {fellow.lastName}
            </div>
            <div className="text-[0.82rem] leading-5 text-muted-foreground truncate" title={fellow.email || undefined}>
              {fellow.email || (
                <span className="italic text-muted-foreground/60">{t('fellows.table.noEmail')}</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <AppointeeStatusBadge
          status={fellow.appointeeStatus}
          subLabel={
            fellow.vitIdInvitation.status === 'failed'
              ? t('fellows.table.lastSendFailed')
              : undefined
          }
          subLabelTone="destructive"
        />
      </td>
      <td className="px-3 py-3 text-[0.9rem] text-muted-foreground">
        {formatLabel(fellow.appointment)}
      </td>
      <td className="px-3 py-3 text-[0.9rem] text-muted-foreground">
        {formatLabel(fellow.fellowship)}
      </td>
      <td className="px-3 py-3">
        <FormStatusCell fellow={fellow} />
      </td>
      <td className="px-3 py-3">
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
              {t('fellows.table.vitIdOnFileUnder')}{' '}
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
                        {t('fellows.table.civicrmId', { id: c.civicrmId })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </td>
      <td className="px-3 py-3">
        <BioEmailPill
          status={fellow.bioEmail.status}
          sentAt={fellow.bioEmail.sentAt}
          sendCount={fellow.bioEmail.sendCount}
          targetAcademicYear={fellow.bioEmail.targetAcademicYear}
        />
      </td>
      <td className="px-3 py-3 text-center">
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
  const { t } = useTranslation();
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
            {t('fellows.dialogs.resendTitle')}
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-[0.95rem] leading-6 text-muted-foreground">
          <p>{t('fellows.dialogs.resendBody', { name: fellowName })}</p>
          <p className="font-medium text-foreground">
            {t('fellows.dialogs.resendConfirmQuestion')}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('fellows.dialogs.sendAgain')}
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
  const { t } = useTranslation();
  const [nominationSentOn, setNominationSentOn] = useState(todayInputValue());

  useEffect(() => {
    if (open) setNominationSentOn(todayInputValue());
  }, [open, fellow?.civicrmId]);

  const fellowName = fellow ? `${fellow.firstName} ${fellow.lastName}` : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="block max-w-[calc(100vw-2rem)] gap-0 rounded-lg border bg-card p-0 sm:max-w-md"
      >
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              {t('fellows.dialogs.nominationTitle')}
            </DialogTitle>
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
                  {t('fellows.dialogs.nominationBody', { name: fellowName })}
                </p>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    {t('fellows.dialogs.nominationDateLabel')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          )}
      </DialogContent>
    </Dialog>
  );
}
