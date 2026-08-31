import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { SelectDropdown } from '@/components/shared/SelectDropdown';
import { useFellowsDashboard } from '@/api/fellows';
import { getCurrentAcademicYear } from './utils/academic-year';
import { Users, Search, AlertCircle, X } from 'lucide-react';
import type {
  AppointmentCategory,
  AppointeeStatus,
  VitIdStatus,
} from '@itatti/shared';
import { FellowsTable } from './fellows/FellowsTable';
import { FellowsManagementSkeleton } from './fellows/skeleton';

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
