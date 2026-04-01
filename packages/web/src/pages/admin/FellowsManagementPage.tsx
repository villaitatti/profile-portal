import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useFellowsDashboard } from '@/api/fellows';
import { getCurrentAcademicYear } from './utils/academic-year';
import { Users, UserX, UserCheck, Search, AlertCircle } from 'lucide-react';
import type { FellowDashboardEntry, FellowStatus } from '@itatti/shared';

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

  if (isLoading) return <LoadingSpinner />;

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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
      <div className="flex border-b mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>
        <select
          value={selectedYear}
          onChange={(e) => {
            setSelectedYear(e.target.value);
            setActiveTab('all');
            setSearchQuery('');
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[140px]"
        >
          {academicYears.length > 0 ? (
            academicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))
          ) : (
            <option value={currentYear}>{currentYear}</option>
          )}
          <option value="">All years</option>
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
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${valueClassName || ''}`}>{value}</div>
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

function FellowsTable({ fellows }: { fellows: FellowDashboardEntry[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
              Fellowship
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              VIT ID Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {fellows.map((fellow) => (
            <tr key={fellow.civicrmId} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="font-semibold text-sm">
                  {fellow.firstName} {fellow.lastName}
                </div>
                <div className="text-xs text-muted-foreground md:hidden">
                  {fellow.email || 'No email'}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                {fellow.email || (
                  <span className="italic text-muted-foreground/60">No email in CiviCRM</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                {fellow.fellowshipYear}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={fellow.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
