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
      <div className="text-center py-8 text-muted-foreground">
        <p>No users found matching &ldquo;{query}&rdquo;.</p>
        <p className="text-sm mt-1">They may not have claimed their VIT ID yet.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-3">
        {users.length} users total{query.trim() ? `, ${filtered.length} matching '${query}'` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Email Verified</th>
              <th className="pb-2 font-medium">Last Login</th>
              <th className="pb-2 font-medium">Signed Up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.user_id} className="border-b">
                <td className="py-2 px-1">{user.name || '—'}</td>
                <td className="py-2 px-1">{user.email}</td>
                <td className="py-2 px-1">
                  {user.email_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="sr-only">{user.email_verified ? 'Email verified' : 'Email not verified'}</span>
                </td>
                <td className="py-2 px-1 text-muted-foreground">
                  {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                </td>
                <td className="py-2 px-1 text-muted-foreground">
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
      <div className="rounded-xl border bg-card p-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by name or email..."
            aria-label="Search by name or email"
            className="w-full rounded-md border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Quick lookup result */}
        {fetchTriggered && searchQuery.trim() && (
          <div className="mt-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            ) : isError ? (
              <Auth0ErrorPanel onRetry={() => refetch()} />
            ) : quickResult ? (
              <div className="flex items-center gap-2 text-sm">
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
      <div className="rounded-xl border bg-card p-6">
        <button
          onClick={handleShowAll}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          aria-expanded={showTable}
          aria-controls="all-users-table"
        >
          {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showTable ? 'Hide all users' : 'Show all users'}
        </button>

        {showTable && (
          <div className="mt-4" id="all-users-table">
            {isLoading ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Email Verified</th>
                    <th className="pb-2 font-medium">Last Login</th>
                    <th className="pb-2 font-medium">Signed Up</th>
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
