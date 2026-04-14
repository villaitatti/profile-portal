import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useClaims } from '@/api/claims';
import type { VitIdClaim } from '@/api/claims';
import { Search, ShieldCheck, Info, ExternalLink, AlertCircle } from 'lucide-react';

const CIVICRM_URL = import.meta.env.VITE_CIVICRM_URL || '';

type SortField = 'name' | 'email' | 'status' | 'claimedAt';
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

export function ClaimLogPage() {
  const { data: claims, isLoading, error } = useClaims();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('claimedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    if (!claims) return [];
    let result = [...claims];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          break;
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'status': {
          const rankA = Number(a.hasCurrentFellowship) * 2 + Number(a.hasFellowship);
          const rankB = Number(b.hasCurrentFellowship) * 2 + Number(b.hasFellowship);
          cmp = rankA - rankB;
          break;
        }
        case 'claimedAt':
          cmp = a.claimedAt.localeCompare(b.claimedAt);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [claims, searchQuery, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'claimedAt' ? 'desc' : 'asc');
    }
  }

  if (isLoading) return <ClaimLogSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader title="Claim Log" />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">Failed to load claims</h3>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Claim Log"
        description="Audit trail of all VIT ID claim attempts"
      />

      <div className="rounded-xl border bg-card p-6">
        {/* Instructions */}
        <div className="mb-6 rounded-lg border border-border bg-secondary/45 p-5">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="space-y-2 text-[0.95rem] leading-7 text-muted-foreground">
              <p>
                This log records every successful VIT ID claim. Each entry shows the
                fellow's name, email, CiviCRM record, fellowship status at the time of
                claim, and which Auth0 roles were assigned.
              </p>
              <p>
                <strong>Fellowship status:</strong> "Current" means the fellow had an
                active fellowship during the current academic year at the time they claimed.
                "Former" means they have at least one fellowship on record but none covering
                the current academic year.
              </p>
              <p>
                If a claim looks suspicious, check the fellow's CiviCRM record and Auth0
                account. Contact the person directly if needed.
              </p>
            </div>
          </div>
        </div>

        {!claims || claims.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-12 w-12 mb-4" />}
            title="No claims yet"
            description="VIT ID claims will appear here as fellows claim their credentials."
          />
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or email..."
                aria-label="Search claims by name or email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border bg-background py-2.5 pl-10 pr-4 text-base outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[0.95rem] text-muted-foreground">
                No claims match &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.95rem]">
                  <thead>
                    <tr className="border-b text-left">
                      <SortHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortHeader field="email" label="Email" current={sortField} dir={sortDir} onSort={toggleSort} className="hidden md:table-cell" />
                      <SortHeader field="status" label="Fellowship Status" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Roles Assigned</th>
                      <SortHeader field="claimedAt" label="Claimed At" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((claim) => (
                      <ClaimRow key={claim.id} claim={claim} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-sm text-muted-foreground">
              {claims.length} total claim{claims.length !== 1 ? 's' : ''}
              {searchQuery.trim() ? `, ${filtered.length} matching` : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ClaimRow({ claim }: { claim: VitIdClaim }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="py-3 px-1">
        <div>
          <div className="text-[0.98rem] font-semibold">
            {claim.firstName} {claim.lastName}
          </div>
          <div className="text-[0.82rem] leading-5 text-muted-foreground md:hidden">
            {claim.email}
          </div>
        </div>
      </td>
      <td className="hidden py-3 px-1 text-[0.95rem] text-muted-foreground md:table-cell">
        {claim.email}
      </td>
      <td className="py-3 px-1">
        {claim.hasCurrentFellowship ? (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Current
          </span>
        ) : claim.hasFellowship ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Former
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            No Fellowship
          </span>
        )}
      </td>
      <td className="py-3 px-1">
        <div className="flex flex-wrap gap-1">
          {claim.rolesAssigned.map((role) => (
            <span
              key={role}
              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[0.75rem] font-medium text-secondary-foreground"
            >
              {role}
            </span>
          ))}
        </div>
      </td>
      <td className="whitespace-nowrap py-3 px-1 text-[0.92rem] text-muted-foreground">
        {formatDateTime(claim.claimedAt)}
      </td>
      <td className="py-3 px-1">
        {CIVICRM_URL && (
          <a
            href={`${CIVICRM_URL}/civicrm/contact/view?reset=1&cid=${claim.civicrmId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            CiviCRM <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  );
}

function SortHeader({
  field,
  label,
  current,
  dir,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  current: string;
  dir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = current === field;
  return (
    <th className={`pb-3 text-left ${className || ''}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex select-none items-center text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function ClaimLogSkeleton() {
  return (
    <div className="space-y-8 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-48 rounded-full" />
        <SkeletonBlock className="h-5 w-[24rem] max-w-full rounded-full" />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="mb-6 rounded-lg border border-border bg-secondary/45 p-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-11/12 rounded-full" />
            <SkeletonBlock className="h-4 w-10/12 rounded-full" />
          </div>
        </div>
        <SkeletonBlock className="mb-4 h-11 w-full rounded-md" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b pb-3">
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="h-4 w-48 rounded-full" />
              <SkeletonBlock className="h-4 w-16 rounded-full" />
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="h-4 w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
