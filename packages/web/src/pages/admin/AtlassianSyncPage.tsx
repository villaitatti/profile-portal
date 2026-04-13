import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner, SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApiToken } from '@/api/client';
import {
  useMappings,
  useStartDryRun,
  useExecuteSync,
  useSyncRuns,
  useSyncRunDetail,
  useSyncStatus,
  subscribeSyncProgress,
  fetchSseToken,
} from '@/api/sync';
import type { SyncProgress, SyncRunDetail } from '@/api/sync';
import { useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  Play,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  UserPlus,
  UserMinus,
  Pencil,
  FolderPlus,
  Link as LinkIcon,
} from 'lucide-react';

// ── Progress Bar ───────────────────────────────────────────────────

function ProgressPanel({ progress, startTime }: { progress: SyncProgress | null; startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!progress || progress.phase === 'done' || progress.phase === 'error') return;
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 500);
    return () => clearInterval(interval);
  }, [progress, startTime]);

  if (!progress) return null;

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{progress.description}</span>
        <span className="text-xs text-muted-foreground">{formatDuration(elapsed)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress.phase === 'error' ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {progress.percentage}%
        {progress.totalSteps > 0 && ` — ${progress.step} of ${progress.totalSteps}`}
      </p>
    </div>
  );
}

// ── Diff Preview ───────────────────────────────────────────────────

function DiffPreview({ run }: { run: SyncRunDetail }) {
  const diff = run.diff;
  if (!diff) return null;

  const totalChanges =
    (diff.usersToCreate?.length || 0) +
    (diff.usersToUpdate?.length || 0) +
    (diff.usersToDeactivate?.length || 0) +
    (diff.groupsToCreate?.length || 0) +
    (diff.membershipChanges?.length || 0);

  if (totalChanges === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="font-medium">Everything in sync</p>
        <p className="text-sm text-muted-foreground">No changes needed.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h3 className="text-lg font-semibold mb-4">Proposed Changes ({totalChanges})</h3>

      {diff.groupsToCreate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-blue-600 mb-1">Groups to Create ({diff.groupsToCreate.length})</h4>
          {diff.groupsToCreate.map((g, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              <span className="font-mono">{g.name}</span>
              <span className="text-muted-foreground ml-2">from role: {g.mappedFromRole}</span>
            </div>
          ))}
        </div>
      )}

      {diff.usersToCreate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-green-600 mb-1">Users to Create ({diff.usersToCreate.length})</h4>
          {diff.usersToCreate.map((u, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              {u.name} <span className="text-muted-foreground">({u.email})</span>
            </div>
          ))}
        </div>
      )}

      {diff.usersToUpdate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-amber-600 mb-1">Users to Update ({diff.usersToUpdate.length})</h4>
          {diff.usersToUpdate.map((u, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              {u.email}:{' '}
              {Object.entries(u.changes).map(([k, v]) => (
                <span key={k} className="text-muted-foreground">
                  {k}: {v.from} → {v.to}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {diff.usersToDeactivate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-red-600 mb-1">Users to Deactivate ({diff.usersToDeactivate.length})</h4>
          {diff.usersToDeactivate.map((u, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              {u.name} <span className="text-muted-foreground">({u.email})</span>
            </div>
          ))}
        </div>
      )}

      {diff.membershipChanges?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-purple-600 mb-1">Membership Changes ({diff.membershipChanges.length})</h4>
          {diff.membershipChanges.map((c, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              <span className={c.action === 'add' ? 'text-green-600' : 'text-red-600'}>
                {c.action === 'add' ? '+' : '-'}
              </span>{' '}
              {c.userEmail} → {c.groupName}
              <span className="text-muted-foreground ml-2 text-xs">{c.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sync History ───────────────────────────────────────────────────

function isDryRun(run: { dryRunId: string | null }) {
  return run.dryRunId === null;
}

function runLabel(run: { status: string; dryRunId: string | null }) {
  if (isDryRun(run)) {
    return run.status === 'completed' ? 'Dry run completed' : `Dry run ${run.status}`;
  }
  return run.status === 'completed' ? 'Sync completed' : `Sync ${run.status}`;
}

function SyncHistory() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useSyncRuns(page);
  const { data: detail } = useSyncRunDetail(expandedId);

  if (isLoading) return <LoadingSpinner variant="panel" rows={5} />;
  if (!data?.runs.length) return null;

  const statusIcon = (run: { status: string; dryRunId: string | null }) => {
    if (isDryRun(run) && run.status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
    }
    switch (run.status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'partial': return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Sync History</h2>
      <div className="space-y-2">
        {data.runs.map((run) => (
          <div key={run.id} className="border rounded-lg">
            <button
              onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors active:scale-100"
            >
              {expandedId === run.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {statusIcon(run)}
              <span className="text-sm font-medium">{runLabel(run)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(run.startedAt).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                by {run.triggeredBy}
              </span>
              {run.stats && (
                <span className="text-xs text-muted-foreground">
                  {run.stats.duration_ms ? `${(run.stats.duration_ms / 1000).toFixed(1)}s` : ''}
                </span>
              )}
            </button>

            {expandedId === run.id && detail && (
              <div className="border-t p-3 text-sm">
                {isDryRun(run) && run.status === 'completed' && (
                  <p className="text-xs text-blue-600 font-medium mb-3">
                    Preview only — no changes were applied to Atlassian Cloud.
                  </p>
                )}

                {detail.stats && (
                  <div className="flex flex-wrap gap-4 mb-3 text-xs">
                    {detail.stats.created > 0 && <span className="inline-flex items-center gap-1 text-green-600"><UserPlus className="h-3 w-3" />+{detail.stats.created} created</span>}
                    {detail.stats.updated > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Pencil className="h-3 w-3" />{detail.stats.updated} updated</span>}
                    {detail.stats.deactivated > 0 && <span className="inline-flex items-center gap-1 text-red-600"><UserMinus className="h-3 w-3" />{detail.stats.deactivated} deactivated</span>}
                    {detail.stats.groupsCreated > 0 && <span className="inline-flex items-center gap-1 text-blue-600"><FolderPlus className="h-3 w-3" />{detail.stats.groupsCreated} groups created</span>}
                    {detail.stats.groupsAdded > 0 && <span className="inline-flex items-center gap-1 text-purple-600"><LinkIcon className="h-3 w-3" />+{detail.stats.groupsAdded} memberships</span>}
                    {detail.stats.groupsRemoved > 0 && <span className="inline-flex items-center gap-1 text-purple-600"><XCircle className="h-3 w-3" />-{detail.stats.groupsRemoved} memberships</span>}
                    {detail.stats.errors > 0 && <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" />{detail.stats.errors} errors</span>}
                  </div>
                )}

                {/* Diff details — show who is affected */}
                {detail.diff && <HistoryDiffDetail diff={detail.diff} /> }

                {detail.result?.operations && (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {detail.result.operations.map((op) => (
                      <div key={op.seq} className={`text-xs py-1 ${op.status === 'error' ? 'text-destructive' : op.status === 'skipped' ? 'text-muted-foreground' : ''}`}>
                        {op.description}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sync-run-${run.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3" /> Export JSON
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {data.total > data.perPage && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 rounded-full border transition-colors hover:bg-muted disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm py-1">
            Page {page} of {Math.ceil(data.total / data.perPage)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * data.perPage >= data.total}
            className="text-sm px-3 py-1 rounded-full border transition-colors hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryDiffDetail({ diff }: { diff: SyncRunDetail['diff'] }) {
  const hasContent =
    diff.usersToCreate?.length > 0 ||
    diff.usersToUpdate?.length > 0 ||
    diff.usersToDeactivate?.length > 0 ||
    diff.groupsToCreate?.length > 0 ||
    diff.membershipChanges?.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-3 mb-3 text-xs">
      {diff.usersToCreate?.length > 0 && (
        <div>
          <h4 className="font-medium text-green-600 mb-1">Users to create ({diff.usersToCreate.length})</h4>
          {diff.usersToCreate.map((u, i) => (
            <div key={i} className="py-0.5">{u.name} <span className="text-muted-foreground">({u.email})</span></div>
          ))}
        </div>
      )}
      {diff.usersToUpdate?.length > 0 && (
        <div>
          <h4 className="font-medium text-amber-600 mb-1">Users to update ({diff.usersToUpdate.length})</h4>
          {diff.usersToUpdate.map((u, i) => (
            <div key={i} className="py-0.5">
              {u.email}{' '}
              <span className="text-muted-foreground">
                {Object.entries(u.changes).map(([k, v]) => `${k}: ${v.from} → ${v.to}`).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
      {diff.usersToDeactivate?.length > 0 && (
        <div>
          <h4 className="font-medium text-red-600 mb-1">Users to deactivate ({diff.usersToDeactivate.length})</h4>
          {diff.usersToDeactivate.map((u, i) => (
            <div key={i} className="py-0.5">{u.name} <span className="text-muted-foreground">({u.email})</span></div>
          ))}
        </div>
      )}
      {diff.groupsToCreate?.length > 0 && (
        <div>
          <h4 className="font-medium text-blue-600 mb-1">Groups to create ({diff.groupsToCreate.length})</h4>
          {diff.groupsToCreate.map((g, i) => (
            <div key={i} className="py-0.5"><span className="font-mono">{g.name}</span> <span className="text-muted-foreground">(from role: {g.mappedFromRole})</span></div>
          ))}
        </div>
      )}
      {diff.membershipChanges?.length > 0 && (
        <div>
          <h4 className="font-medium text-purple-600 mb-1">Membership changes ({diff.membershipChanges.length})</h4>
          {diff.membershipChanges.map((c, i) => (
            <div key={i} className="py-0.5">
              <span className={c.action === 'add' ? 'text-green-600' : 'text-red-600'}>
                {c.action === 'add' ? '+' : '-'}
              </span>{' '}
              {c.userEmail} → {c.groupName}
              <span className="text-muted-foreground ml-1">({c.reason})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export function AtlassianSyncPage() {
  const { data: status, isLoading: statusLoading } = useSyncStatus();
  const { data: mappings, isLoading: mappingsLoading } = useMappings();
  const startDryRun = useStartDryRun();
  const executeSyncMutation = useExecuteSync();
  const queryClient = useQueryClient();
  const getToken = useApiToken();

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastDryRunId, setLastDryRunId] = useState<string | null>(null);
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const { data: dryRunDetail } = useSyncRunDetail(lastDryRunId);

  // TTL countdown
  const [ttlRemaining, setTtlRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!dryRunDetail?.completedAt) { setTtlRemaining(null); return; }
    const ttlMs = 60 * 60 * 1000;
    const update = () => {
      const remaining = ttlMs - (Date.now() - new Date(dryRunDetail.completedAt!).getTime());
      setTtlRemaining(remaining > 0 ? remaining : 0);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [dryRunDetail?.completedAt]);

  // Track active SSE subscription for cleanup on unmount or new run
  const activeUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { activeUnsubRef.current?.(); };
  }, []);

  const startSseSubscription = useCallback(
    (runId: string, sseToken: string, onDone: () => void) => {
      activeUnsubRef.current?.();
      const unsub = subscribeSyncProgress(
        runId,
        sseToken,
        (p) => setProgress(p),
        () => { activeUnsubRef.current = null; onDone(); },
        (err) => {
          activeUnsubRef.current = null;
          setProgress({ phase: 'error', step: 0, totalSteps: 0, percentage: 0, description: err });
          setActiveRunId(null);
        }
      );
      activeUnsubRef.current = unsub;
    },
    []
  );

  const handleDryRun = useCallback(async () => {
    const sseToken = await fetchSseToken(getToken);
    startDryRun.mutate(undefined, {
      onSuccess: ({ runId }) => {
        setActiveRunId(runId);
        setStartTime(Date.now());
        setProgress({ phase: 'starting', step: 0, totalSteps: 0, percentage: 0, description: 'Starting dry run...' });
        startSseSubscription(runId, sseToken, () => {
          setLastDryRunId(runId);
          setActiveRunId(null);
          queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
          queryClient.invalidateQueries({ queryKey: ['sync-run', runId] });
        });
      },
    });
  }, [startDryRun, queryClient, getToken, startSseSubscription]);

  const handleExecute = useCallback(async () => {
    if (!lastDryRunId) return;
    const sseToken = await fetchSseToken(getToken);
    executeSyncMutation.mutate(lastDryRunId, {
      onSuccess: ({ runId }) => {
        setActiveRunId(runId);
        setStartTime(Date.now());
        setProgress({ phase: 'starting', step: 0, totalSteps: 0, percentage: 0, description: 'Starting execution...' });
        startSseSubscription(runId, sseToken, () => {
          setLastDryRunId(null);
          setActiveRunId(null);
          queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
        });
      },
    });
  }, [lastDryRunId, executeSyncMutation, queryClient, getToken, startSseSubscription]);

  if (statusLoading || mappingsLoading) return <AtlassianSyncPageSkeleton />;

  const hasMappings = Array.isArray(mappings) && mappings.length > 0;
  const mappingsEmpty = Array.isArray(mappings) && mappings.length === 0;
  const isRunning = !!activeRunId;
  const canExecute = lastDryRunId && dryRunDetail?.status === 'completed' && (ttlRemaining === null || ttlRemaining > 0);

  return (
    <div>
      <PageHeader
        title="Sync Users to Atlassian Cloud"
        description="Sync users and groups from Auth0 to Atlassian Cloud"
      />

      {!status?.configured && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Atlassian Cloud sync is not configured yet. Please contact IT to set up the SCIM connection.
            </p>
          </div>
        </div>
      )}

      {mappingsEmpty && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              No group mappings configured.{' '}
              <Link to="/admin/atlassian/mappings" className="font-medium underline hover:no-underline">
                Configure Group Mappings →
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Sync actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleDryRun}
            disabled={isRunning || startDryRun.isPending || !status?.configured || mappingsEmpty}
            className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            Preview Changes
          </button>

          {canExecute && (
            <>
              <button
                onClick={() => setShowExecuteConfirm(true)}
                disabled={isRunning}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Execute Sync
              </button>
              {ttlRemaining !== null && (
                <span className="text-[0.82rem] text-muted-foreground">
                  Valid for {Math.floor(ttlRemaining / 60000)}m {Math.floor((ttlRemaining % 60000) / 1000)}s
                </span>
              )}
            </>
          )}

          {hasMappings && !isRunning && !lastDryRunId && (
            <span className="text-[0.95rem] text-muted-foreground">
              Preview changes before syncing
            </span>
          )}
        </div>

        {/* Progress */}
        {isRunning && <ProgressPanel progress={progress} startTime={startTime} />}

        {/* Diff preview */}
        {dryRunDetail && !isRunning && <DiffPreview run={dryRunDetail} />}

        {/* Sync history */}
        <SyncHistory />
      </div>

      <ConfirmDialog
        open={showExecuteConfirm}
        onConfirm={() => {
          setShowExecuteConfirm(false);
          if (canExecute) handleExecute();
        }}
        onCancel={() => setShowExecuteConfirm(false)}
        title="Execute Sync to Atlassian Cloud"
        description={(() => {
          const parts = dryRunDetail?.diff
            ? [
                dryRunDetail.diff.usersToCreate?.length && `create ${dryRunDetail.diff.usersToCreate.length} user(s)`,
                dryRunDetail.diff.usersToUpdate?.length && `update ${dryRunDetail.diff.usersToUpdate.length} user(s)`,
                dryRunDetail.diff.usersToDeactivate?.length && `deactivate ${dryRunDetail.diff.usersToDeactivate.length} user(s)`,
                dryRunDetail.diff.groupsToCreate?.length && `create ${dryRunDetail.diff.groupsToCreate.length} group(s)`,
                dryRunDetail.diff.membershipChanges?.length && `${dryRunDetail.diff.membershipChanges.length} membership change(s)`,
              ].filter(Boolean)
            : [];
          return parts.length > 0
            ? `This will apply changes to Atlassian Cloud: ${parts.join(', ')}. This action cannot be undone.`
            : 'Apply the previewed changes to Atlassian Cloud. This action cannot be undone.';
        })()}
        confirmLabel="Execute Sync"
        variant="danger"
      />
    </div>
  );
}

function AtlassianSyncPageSkeleton() {
  return (
    <div className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-80 rounded-full" />
        <SkeletonBlock className="h-5 w-[32rem] max-w-full rounded-full" />
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-32 rounded-full" />
          <SkeletonBlock className="h-10 w-32 rounded-full" />
          <SkeletonBlock className="h-4 w-40 rounded-full" />
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <SkeletonBlock className="h-5 w-52 rounded-full" />
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </div>
          <SkeletonBlock className="h-2 w-full rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-28 rounded-full" />
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <SkeletonBlock className="mb-4 h-6 w-48 rounded-full" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-4 w-44 rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-5/6 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <SkeletonBlock className="mb-4 h-6 w-32 rounded-full" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-border/80 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-4 w-4 rounded-full bg-muted/80" />
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-3.5 w-28 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
