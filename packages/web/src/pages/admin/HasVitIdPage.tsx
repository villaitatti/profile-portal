import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import { useVitIdLookup } from '@/api/vit-id-lookup';
import { Search, AlertCircle, XCircle } from 'lucide-react';
import type { Auth0Candidate } from '@itatti/shared';

export function HasVitIdPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const lookup = useVitIdLookup(searchQuery);
  const trimmed = searchQuery.trim();
  const looksLikeEmail = trimmed.includes('@');
  // Suppress stale results from a previous query while the debounce is
  // catching up. Only render lookup.data when it corresponds to the current
  // trimmed input.
  const dataIsFresh = lookup.debouncedQuery === trimmed;

  return (
    <div>
      <PageHeader
        title="Has VIT ID?"
        description="Check whether someone has a VIT ID account"
      />

      <div className="mb-6 rounded-xl border bg-card p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by name or paste an email address..."
            aria-label="Search by name or email"
            className="w-full rounded-md border bg-background py-2.5 pl-10 pr-4 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="mt-4">
          {trimmed.length === 0 ? (
            <p className="text-[0.95rem] text-muted-foreground">
              Type a name or an email address to check.
            </p>
          ) : lookup.isLoading || !dataIsFresh ? (
            <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
              <div className="h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          ) : lookup.isError ? (
            <ErrorPanel onRetry={() => lookup.refetch()} />
          ) : lookup.data?.kind === 'email-lookup' ? (
            <EmailLookupResult data={lookup.data.match} query={trimmed} />
          ) : lookup.data?.kind === 'name-search' ? (
            <NameSearchResult candidates={lookup.data.candidates} query={trimmed} />
          ) : null}
        </div>

        {trimmed.length > 0 && !looksLikeEmail && (
          <p className="mt-3 text-[0.82rem] text-muted-foreground">
            Tip: to check a specific email (including old emails a fellow may
            have used), paste the full email address.
          </p>
        )}
      </div>
    </div>
  );
}

function EmailLookupResult({
  data,
  query,
}: {
  data: import('@itatti/shared').FellowMatch;
  query: string;
}) {
  if (data.status === 'no-account') {
    return (
      <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
        <XCircle className="h-5 w-5" aria-hidden="true" />
        <span>
          No account found for &ldquo;{query}&rdquo;. They may not have claimed their VIT ID yet.
        </span>
      </div>
    );
  }

  const matched = 'matched' in data ? data.matched : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <VitIdStatusBadge
          status={data.status}
          matchedVia={'matchedVia' in data ? data.matchedVia : undefined}
          matched={'matched' in data ? data.matched : undefined}
          matchedViaEmail={'matchedViaEmail' in data ? data.matchedViaEmail : undefined}
          reason={'reason' in data ? data.reason : undefined}
          candidates={'candidates' in data ? data.candidates : undefined}
        />
      </div>
      {matched && (
        <p className="text-[0.95rem]">
          VIT ID on file under: <span className="font-mono">{matched.email}</span>
          {matched.name && (
            <span className="text-muted-foreground"> ({matched.name})</span>
          )}
        </p>
      )}
    </div>
  );
}

function NameSearchResult({
  candidates,
  query,
}: {
  candidates: Auth0Candidate[];
  query: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
        <XCircle className="h-5 w-5" aria-hidden="true" />
        <span>
          No one matching &ldquo;{query}&rdquo; has a VIT ID yet.
        </span>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[0.95rem] text-muted-foreground">
        {candidates.length} match{candidates.length === 1 ? '' : 'es'} for &ldquo;{query}&rdquo;:
      </p>
      <ul className="divide-y rounded-md border bg-background">
        {candidates.map((c) => (
          <li key={c.userId} className="flex flex-col gap-0.5 px-4 py-3">
            <span className="font-medium">{c.name ?? '(no name on file)'}</span>
            <span className="font-mono text-[0.9rem] text-muted-foreground">{c.email}</span>
            {c.civicrmId && (
              <span className="text-[0.8rem] text-muted-foreground/80">
                civicrm_id: {c.civicrmId}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-600" />
        <p className="text-sm text-amber-800">
          Search failed. Try again.
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
