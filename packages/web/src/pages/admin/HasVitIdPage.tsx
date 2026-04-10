import { useState, useMemo, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAllUsers } from '@/api/users';
import type { Auth0UserListItem } from '@/api/users';
import { Search, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

function SkeletonRow() {
  return (
    <tr className="border-b">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="py-3 px-2">
          <div className="h-4 bg-muted rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function Auth0ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-600" />
        <p className="text-sm text-amber-800">
          Unable to load users from Auth0. Try again later.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="mt-2 text-sm text-amber-700 underline hover:no-underline"
      >
        Retry
      </button>
    </div>
  );
}

function UserTable({ users, query }: { users: Auth0UserListItem[]; query: string }) {
  const commonHeaderClass = 'pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name?.trim().toLowerCase().includes(q)) ||
        u.email.trim().toLowerCase().includes(q)
    );
  }, [users, query]);

  if (filtered.length === 0 && query.trim()) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No users found matching &ldquo;{query}&rdquo;.</p>
        <p className="mt-1 text-[0.95rem]">They may not have claimed their VIT ID yet.</p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-[0.95rem] text-muted-foreground">
        {users.length} users total{query.trim() ? `, ${filtered.length} matching '${query}'` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b text-left">
              <th className={commonHeaderClass}>Name</th>
              <th className={commonHeaderClass}>Email</th>
              <th className={commonHeaderClass}>Email Verified</th>
              <th className={commonHeaderClass}>Last Login</th>
              <th className={commonHeaderClass}>Signed Up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.user_id} className="border-b">
                <td className="px-1 py-3">{user.name || '—'}</td>
                <td className="px-1 py-3">{user.email}</td>
                <td className="px-1 py-3">
                  {user.email_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="sr-only">{user.email_verified ? 'Email verified' : 'Email not verified'}</span>
                </td>
                <td className="px-1 py-3 text-muted-foreground">
                  {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-1 py-3 text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function HasVitIdPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showTable, setShowTable] = useState(false);
  const [fetchTriggered, setFetchTriggered] = useState(false);

  const { data: users, isLoading, isError, refetch } = useAllUsers(fetchTriggered);

  const triggerFetch = useCallback(() => {
    if (!fetchTriggered) setFetchTriggered(true);
  }, [fetchTriggered]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      triggerFetch();
    },
    [triggerFetch]
  );

  const handleShowAll = useCallback(() => {
    setShowTable((prev) => !prev);
    triggerFetch();
  }, [triggerFetch]);

  // Quick lookup result
  const quickResult = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !users) return null;
    return users.find(
      (u) => u.email.trim().toLowerCase().includes(q) || u.name?.trim().toLowerCase().includes(q)
    );
  }, [searchQuery, users]);

  return (
    <div>
      <PageHeader
        title="Has VIT ID?"
        description="Check whether someone has a VIT ID account"
      />

      {/* Search box */}
      <div className="mb-6 rounded-2xl border bg-card p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by name or email..."
            aria-label="Search by name or email"
            className="w-full rounded-md border bg-background py-2.5 pl-10 pr-4 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Quick lookup result */}
        {fetchTriggered && searchQuery.trim() && (
          <div className="mt-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
                <div className="h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            ) : isError ? (
              <Auth0ErrorPanel onRetry={() => refetch()} />
            ) : quickResult ? (
              <div className="flex items-center gap-2 text-[0.95rem]">
                <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
                <span>
                  Yes, <strong>{quickResult.name || quickResult.email}</strong> has a VIT ID
                  {quickResult.last_login && (
                    <span className="text-muted-foreground">
                      {' '}(last login: {new Date(quickResult.last_login).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
                <XCircle className="h-5 w-5" aria-hidden="true" />
                <span>
                  No account found for &ldquo;{searchQuery}&rdquo;. They may not have claimed their VIT ID yet.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable full table */}
      <div className="rounded-2xl border bg-card p-6">
        <button
          onClick={handleShowAll}
          className="flex items-center gap-2 text-[0.95rem] font-semibold text-primary hover:underline"
          aria-expanded={showTable}
          aria-controls="all-users-table"
        >
          {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showTable ? 'Hide all users' : 'Show all users'}
        </button>

        {showTable && (
          <div className="mt-4" id="all-users-table">
            {isLoading ? (
              <table className="w-full text-[0.95rem]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Name</th>
                    <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Email</th>
                    <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Email Verified</th>
                    <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Last Login</th>
                    <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </tbody>
              </table>
            ) : isError ? (
              <Auth0ErrorPanel onRetry={() => refetch()} />
            ) : users ? (
              <UserTable users={users} query={searchQuery} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
