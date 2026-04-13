import { useState, useMemo, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useFellowsDashboard } from '@/api/fellows';
import { getCurrentAcademicYear } from './utils/academic-year';
import { Users, UserX, UserCheck, Search, AlertCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import type { FellowDashboardEntry, FellowStatus, CivicrmIdStatus } from '@itatti/shared';

const CIVICRM_URL = import.meta.env.VITE_CIVICRM_URL || '';

type FilterTab = 'all' | FellowStatus;

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
          title="Fellows Management"
          description="Monitor VIT ID provisioning for current and past fellows"
        />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">Failed to load fellows</h3>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? { total: 0, noAccount: 0, active: 0 };
  const academicYears = data?.academicYears ?? [];

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.total },
    { key: 'no-account', label: 'Needs Account', count: summary.noAccount },
    { key: 'active', label: 'Active', count: summary.active },
  ];

  return (
    <div>
      <PageHeader
        title="Fellows Management"
        description="Monitor VIT ID provisioning for current and past fellows"
      />

      {/* Summary Cards */}
      <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <SummaryCard
          label="Total Fellows"
          value={summary.total}
          icon={<Users className="h-5 w-5 text-primary" />}
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

      {/* Search + Year Filter */}
      <div className="mb-5 flex gap-4">
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
          <div key={index} className="rounded-2xl border bg-card p-5">
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

        <div className="overflow-hidden rounded-2xl border bg-card">
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
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.8rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={`mt-3 text-[1.9rem] font-semibold tracking-tight ${valueClassName || ''}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: FellowStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      No Account
    </span>
  );
}

function formatLabel(value?: string): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortField = 'name' | 'email' | 'appointment' | 'fellowship' | 'fellowshipYear' | 'status';
type SortDir = 'asc' | 'desc';
const FELLOWS_PER_PAGE = 25;

function FellowsTable({ fellows }: { fellows: FellowDashboardEntry[] }) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Reset to page 1 when the underlying data changes (filter/search/year)
  useEffect(() => setPage(1), [fellows]);

  const sorted = useMemo(() => {
    return [...fellows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          break;
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '');
          break;
        case 'appointment':
          cmp = (a.appointment || '').localeCompare(b.appointment || '');
          break;
        case 'fellowship':
          cmp = (a.fellowship || '').localeCompare(b.fellowship || '');
          break;
        case 'fellowshipYear':
          cmp = a.fellowshipYear.localeCompare(b.fellowshipYear);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
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
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortHeader field="name" label="Name" />
              <SortHeader field="email" label="Email" className="hidden md:table-cell" />
              <SortHeader field="appointment" label="Appointment" className="hidden lg:table-cell" />
              <SortHeader field="fellowship" label="Fellowship Type" className="hidden lg:table-cell" />
              <SortHeader field="fellowshipYear" label="Year" className="hidden sm:table-cell" />
              <SortHeader field="status" label="VIT ID Status" />
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
                <td className="hidden px-4 py-3 text-[0.95rem] text-muted-foreground sm:table-cell">
                  {fellow.fellowshipYear}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={fellow.status} />
                    {fellow.civicrmIdStatus === 'missing' && (
                      <span title="Auth0 account exists but civicrm_id is missing from app_metadata">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * FELLOWS_PER_PAGE + 1}–{Math.min(page * FELLOWS_PER_PAGE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
