import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatHumanDateTime } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner, SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { getErrorMessage } from '@/lib/errors';
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
  const { t } = useTranslation();
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
    <div className="rounded-xl border bg-card p-6">
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
        {progress.totalSteps > 0 &&
          ` — ${t('admin.atlassian.sync.stepOfTotal', { step: progress.step, total: progress.totalSteps })}`}
      </p>
    </div>
  );
}

// ── Diff Preview ───────────────────────────────────────────────────

function DiffPreview({ run }: { run: SyncRunDetail }) {
  const { t } = useTranslation();
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
      <div className="rounded-xl border bg-card p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="font-medium">{t('admin.atlassian.sync.everythingInSync')}</p>
        <p className="text-sm text-muted-foreground">{t('admin.atlassian.sync.noChangesNeeded')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="text-lg font-semibold mb-4">
        {t('admin.atlassian.sync.proposedChanges', { count: totalChanges })}
      </h3>

      {diff.groupsToCreate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-blue-600 mb-1">
            {t('admin.atlassian.sync.groupsToCreate', { count: diff.groupsToCreate.length })}
          </h4>
          {diff.groupsToCreate.map((g, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              <span className="font-mono">{g.name}</span>
              <span className="text-muted-foreground ml-2">
                {t('admin.atlassian.sync.fromRole', { role: g.mappedFromRole })}
              </span>
            </div>
          ))}
        </div>
      )}

      {diff.usersToCreate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-green-600 mb-1">
            {t('admin.atlassian.sync.usersToCreate', { count: diff.usersToCreate.length })}
          </h4>
          {diff.usersToCreate.map((u, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              {u.name} <span className="text-muted-foreground">({u.email})</span>
            </div>
          ))}
        </div>
      )}

      {diff.usersToUpdate?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-amber-600 mb-1">
            {t('admin.atlassian.sync.usersToUpdate', { count: diff.usersToUpdate.length })}
          </h4>
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
          <h4 className="text-sm font-medium text-red-600 mb-1">
            {t('admin.atlassian.sync.usersToDeactivate', { count: diff.usersToDeactivate.length })}
          </h4>
          {diff.usersToDeactivate.map((u, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              {u.name} <span className="text-muted-foreground">({u.email})</span>
            </div>
          ))}
        </div>
      )}

      {diff.membershipChanges?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-purple-600 mb-1">
            {t('admin.atlassian.sync.membershipChanges', { count: diff.membershipChanges.length })}
          </h4>
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

function runLabel(t: TFunction, run: { status: string; dryRunId: string | null }) {
  // Statuses come from the API; translate the known ones and fall back to the
  // raw value for anything new.
  const status = t(`admin.status.${run.status}`, run.status);
  if (isDryRun(run)) {
    return run.status === 'completed'
      ? t('admin.atlassian.sync.dryRunCompleted')
      : t('admin.atlassian.sync.dryRunStatus', { status });
  }
  return run.status === 'completed'
    ? t('admin.atlassian.sync.syncCompleted')
    : t('admin.atlassian.sync.syncStatus', { status });
}

function SyncHistory() {
  const { t, i18n } = useTranslation();
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
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">{t('admin.atlassian.sync.historyTitle')}</h2>
      <div className="space-y-2">
        {data.runs.map((run) => (
          <div key={run.id} className="border rounded-lg">
            <button
              onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
            >
              {expandedId === run.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {statusIcon(run)}
              <span className="text-sm font-medium">{runLabel(t, run)}</span>
              <span className="text-xs text-muted-foreground">
                {formatHumanDateTime(run.startedAt, i18n.language)}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {t('admin.atlassian.sync.byUser', { user: run.triggeredBy })}
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
                    {t('admin.atlassian.sync.previewOnly')}
                  </p>
                )}

                {detail.stats && (
                  <div className="flex flex-wrap gap-4 mb-3 text-xs">
                    {detail.stats.created > 0 && <span className="inline-flex items-center gap-1 text-green-600"><UserPlus className="h-3 w-3" />{t('admin.atlassian.sync.statCreated', { count: detail.stats.created })}</span>}
                    {detail.stats.updated > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Pencil className="h-3 w-3" />{t('admin.atlassian.sync.statUpdated', { count: detail.stats.updated })}</span>}
                    {detail.stats.deactivated > 0 && <span className="inline-flex items-center gap-1 text-red-600"><UserMinus className="h-3 w-3" />{t('admin.atlassian.sync.statDeactivated', { count: detail.stats.deactivated })}</span>}
                    {detail.stats.groupsCreated > 0 && <span className="inline-flex items-center gap-1 text-blue-600"><FolderPlus className="h-3 w-3" />{t('admin.atlassian.sync.statGroupsCreated', { count: detail.stats.groupsCreated })}</span>}
                    {detail.stats.groupsAdded > 0 && <span className="inline-flex items-center gap-1 text-purple-600"><LinkIcon className="h-3 w-3" />{t('admin.atlassian.sync.statMembershipsAdded', { count: detail.stats.groupsAdded })}</span>}
                    {detail.stats.groupsRemoved > 0 && <span className="inline-flex items-center gap-1 text-purple-600"><XCircle className="h-3 w-3" />{t('admin.atlassian.sync.statMembershipsRemoved', { count: detail.stats.groupsRemoved })}</span>}
                    {detail.stats.errors > 0 && <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" />{t('admin.atlassian.sync.statErrors', { count: detail.stats.errors })}</span>}
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
                    // Deferred so the browser can still read the blob (same
                    // reason as the automations export below).
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3" /> {t('admin.atlassian.sync.exportJson')}
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
            className="text-sm px-3 py-1 rounded-md border transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t('admin.atlassian.sync.previous')}
          </button>
          <span className="text-sm py-1">
            {t('admin.atlassian.sync.pageOf', { page, total: Math.ceil(data.total / data.perPage) })}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * data.perPage >= data.total}
            className="text-sm px-3 py-1 rounded-md border transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t('admin.atlassian.sync.next')}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryDiffDetail({ diff }: { diff: SyncRunDetail['diff'] }) {
  const { t } = useTranslation();
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
          <h4 className="font-medium text-green-600 mb-1">{t('admin.atlassian.sync.historyUsersToCreate', { count: diff.usersToCreate.length })}</h4>
          {diff.usersToCreate.map((u, i) => (
            <div key={i} className="py-0.5">{u.name} <span className="text-muted-foreground">({u.email})</span></div>
          ))}
        </div>
      )}
      {diff.usersToUpdate?.length > 0 && (
        <div>
          <h4 className="font-medium text-amber-600 mb-1">{t('admin.atlassian.sync.historyUsersToUpdate', { count: diff.usersToUpdate.length })}</h4>
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
          <h4 className="font-medium text-red-600 mb-1">{t('admin.atlassian.sync.historyUsersToDeactivate', { count: diff.usersToDeactivate.length })}</h4>
          {diff.usersToDeactivate.map((u, i) => (
            <div key={i} className="py-0.5">{u.name} <span className="text-muted-foreground">({u.email})</span></div>
          ))}
        </div>
      )}
      {diff.groupsToCreate?.length > 0 && (
        <div>
          <h4 className="font-medium text-blue-600 mb-1">{t('admin.atlassian.sync.historyGroupsToCreate', { count: diff.groupsToCreate.length })}</h4>
          {diff.groupsToCreate.map((g, i) => (
            <div key={i} className="py-0.5"><span className="font-mono">{g.name}</span> <span className="text-muted-foreground">{t('admin.atlassian.sync.historyFromRole', { role: g.mappedFromRole })}</span></div>
          ))}
        </div>
      )}
      {diff.membershipChanges?.length > 0 && (
        <div>
          <h4 className="font-medium text-purple-600 mb-1">{t('admin.atlassian.sync.historyMembershipChanges', { count: diff.membershipChanges.length })}</h4>
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

type RunKind = 'dry-run' | 'execute';

// i18n keys; resolved with t() where rendered.
const RUN_KIND_LABEL_KEYS: Record<RunKind, string> = {
  'dry-run': 'admin.atlassian.sync.previewFailed',
  execute: 'admin.atlassian.sync.syncFailed',
};


export function AtlassianSyncPage() {
  const { t } = useTranslation();
  const { data: status, isLoading: statusLoading } = useSyncStatus();
  const {
    data: mappings,
    isLoading: mappingsLoading,
    error: mappingsError,
    refetch: refetchMappings,
    isFetching: mappingsFetching,
  } = useMappings();
  const startDryRun = useStartDryRun();
  const executeSyncMutation = useExecuteSync();
  const queryClient = useQueryClient();
  const getToken = useApiToken();

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  // Every runError is post-start: SSE tokens are run-bound, so even a token
  // failure happens after the run began server-side (failRun refreshes
  // history and drops the stale preview accordingly).
  const [runError, setRunError] = useState<{ kind: RunKind; message: string } | null>(null);
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

  // Post-start failure: the run reached the server (or the SSE stream errored
  // mid-run), so a failure row may exist and the previewed diff can no longer be
  // trusted.
  const failRun = useCallback(
    (kind: RunKind, message: string) => {
      setRunError({ kind, message });
      // A failed run is still recorded server-side — refresh history so the
      // failure row appears instead of leaving the page looking untouched.
      void queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
      // Drop the previewed diff: after a failure we can no longer claim it
      // describes the current Atlassian state, so it must not stay on screen
      // next to an Execute button.
      setLastDryRunId(null);
    },
    [queryClient]
  );

  const startSseSubscription = useCallback(
    (runId: string, sseToken: string, kind: RunKind, onDone: () => void) => {
      activeUnsubRef.current?.();
      const unsub = subscribeSyncProgress(
        runId,
        sseToken,
        (p) => setProgress(p),
        () => { activeUnsubRef.current = null; onDone(); },
        (err) => {
          activeUnsubRef.current = null;
          // Keep the last known step and flag it as failed. The panel render
          // guard below also tests for the error phase, so clearing
          // activeRunId no longer unmounts the failure.
          setProgress((prev) =>
            prev
              ? { ...prev, phase: 'error' }
              : { phase: 'error', step: 0, totalSteps: 0, percentage: 0, description: t('admin.atlassian.sync.runFailed') }
          );
          setActiveRunId(null);
          failRun(kind, err);
        }
      );
      activeUnsubRef.current = unsub;
    },
    [failRun, t]
  );

  const handleDryRun = useCallback(async () => {
    setRunError(null);
    setProgress(null);
    startDryRun.mutate(undefined, {
      onSuccess: ({ runId }) => {
        setActiveRunId(runId);
        setStartTime(Date.now());
        setProgress({ phase: 'starting', step: 0, totalSteps: 0, percentage: 0, description: t('admin.atlassian.sync.startingDryRun') });
        // SSE tokens are bound to the run id, so the token can only be
        // requested once the run exists. A token failure here means the run
        // continues server-side without a progress view — surface it as a
        // run error so the admin refreshes the history instead of waiting.
        void (async () => {
          let sseToken: string;
          try {
            sseToken = await fetchSseToken(getToken, runId);
          } catch (err) {
            failRun('dry-run', getErrorMessage(err));
            return;
          }
          startSseSubscription(runId, sseToken, 'dry-run', () => {
            setLastDryRunId(runId);
            setActiveRunId(null);
            void queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
            void queryClient.invalidateQueries({ queryKey: ['sync-run', runId] });
          });
        })();
      },
      onError: (err) => failRun('dry-run', getErrorMessage(err)),
    });
  }, [startDryRun, queryClient, getToken, startSseSubscription, failRun, t]);

  const handleExecute = useCallback(async () => {
    if (!lastDryRunId) return;
    const dryRunId = lastDryRunId;
    setRunError(null);
    setProgress(null);
    executeSyncMutation.mutate(dryRunId, {
      onSuccess: ({ runId }) => {
        setActiveRunId(runId);
        setStartTime(Date.now());
        setProgress({ phase: 'starting', step: 0, totalSteps: 0, percentage: 0, description: t('admin.atlassian.sync.startingExecution') });
        // Run-bound SSE token: request it now that the run id exists.
        void (async () => {
          let sseToken: string;
          try {
            sseToken = await fetchSseToken(getToken, runId);
          } catch (err) {
            failRun('execute', getErrorMessage(err));
            return;
          }
          startSseSubscription(runId, sseToken, 'execute', () => {
            setLastDryRunId(null);
            setActiveRunId(null);
            void queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
          });
        })();
      },
      onError: (err) => failRun('execute', getErrorMessage(err)),
    });
  }, [lastDryRunId, executeSyncMutation, queryClient, getToken, startSseSubscription, failRun, t]);

  if (statusLoading || mappingsLoading) return <AtlassianSyncPageSkeleton />;

  const hasMappings = Array.isArray(mappings) && mappings.length > 0;
  const mappingsEmpty = Array.isArray(mappings) && mappings.length === 0;
  // An errored mappings query leaves `mappings` undefined: neither the
  // "configure mappings" warning nor the happy path applies, so the dry run
  // must be blocked until we know which roles are mapped.
  const mappingsUnavailable = !!mappingsError;
  const isRunning = !!activeRunId;
  const canExecute = lastDryRunId && dryRunDetail?.status === 'completed' && (ttlRemaining === null || ttlRemaining > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('admin.atlassian.sync.title')}
        description={t('admin.atlassian.sync.description')}
      />

      {!status?.configured && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              {t('admin.atlassian.sync.notConfigured')}
            </p>
          </div>
        </div>
      )}

      {mappingsEmpty && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              <Trans
                i18nKey="admin.atlassian.sync.noMappings"
                components={{
                  mapLink: (
                    <Link
                      to="/admin/atlassian/mappings"
                      className="font-medium underline hover:no-underline"
                    />
                  ),
                }}
              />
            </p>
          </div>
        </div>
      )}

      {mappingsUnavailable && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
            <p className="flex-1 text-sm text-destructive">
              {t('admin.atlassian.sync.mappingsUnavailable')}
            </p>
            <button
              onClick={() => void refetchMappings()}
              disabled={mappingsFetching}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${mappingsFetching ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Sync actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleDryRun()}
            disabled={
              isRunning ||
              startDryRun.isPending ||
              !status?.configured ||
              mappingsEmpty ||
              mappingsUnavailable
            }
            className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            {t('admin.atlassian.sync.previewChanges')}
          </button>

          {canExecute && (
            <>
              <button
                onClick={() => setShowExecuteConfirm(true)}
                disabled={isRunning}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {t('admin.atlassian.sync.executeSync')}
              </button>
              {ttlRemaining !== null && (
                <span className="text-[0.82rem] text-muted-foreground">
                  {t('admin.atlassian.sync.validFor', {
                    minutes: Math.floor(ttlRemaining / 60000),
                    seconds: Math.floor((ttlRemaining % 60000) / 1000),
                  })}
                </span>
              )}
            </>
          )}

          {hasMappings && !isRunning && !lastDryRunId && (
            <span className="text-[0.95rem] text-muted-foreground">
              {t('admin.atlassian.sync.previewFirst')}
            </span>
          )}
        </div>

        {/* Progress — stays mounted in the error phase so a failed run does not
            silently revert the page to its pre-run state. */}
        {(isRunning || progress?.phase === 'error') && (
          <ProgressPanel progress={progress} startTime={startTime} />
        )}

        {runError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {t(RUN_KIND_LABEL_KEYS[runError.kind])}
                </p>
                <p className="mt-1 text-sm text-destructive/90">{runError.message}</p>
                <p className="mt-1 text-sm text-destructive/90">
                  {runError.kind === 'execute'
                    ? t('admin.atlassian.sync.executeFailedBody')
                    : t('admin.atlassian.sync.previewFailedBody')}
                </p>
              </div>
              <button
                onClick={() => setRunError(null)}
                className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                {t('admin.atlassian.sync.dismiss')}
              </button>
            </div>
          </div>
        )}

        {/* Diff preview */}
        {dryRunDetail && !isRunning && <DiffPreview run={dryRunDetail} />}

        {/* Sync history */}
        <SyncHistory />
      </div>

      <ConfirmDialog
        open={showExecuteConfirm}
        onConfirm={() => {
          setShowExecuteConfirm(false);
          if (canExecute) void handleExecute();
        }}
        onCancel={() => setShowExecuteConfirm(false)}
        title={t('admin.atlassian.sync.confirmTitle')}
        description={(() => {
          const parts = dryRunDetail?.diff
            ? [
                dryRunDetail.diff.usersToCreate?.length &&
                  t('admin.atlassian.sync.partCreateUsers', { count: dryRunDetail.diff.usersToCreate.length }),
                dryRunDetail.diff.usersToUpdate?.length &&
                  t('admin.atlassian.sync.partUpdateUsers', { count: dryRunDetail.diff.usersToUpdate.length }),
                dryRunDetail.diff.usersToDeactivate?.length &&
                  t('admin.atlassian.sync.partDeactivateUsers', { count: dryRunDetail.diff.usersToDeactivate.length }),
                dryRunDetail.diff.groupsToCreate?.length &&
                  t('admin.atlassian.sync.partCreateGroups', { count: dryRunDetail.diff.groupsToCreate.length }),
                dryRunDetail.diff.membershipChanges?.length &&
                  t('admin.atlassian.sync.partMembershipChanges', { count: dryRunDetail.diff.membershipChanges.length }),
              ].filter(Boolean)
            : [];
          return parts.length > 0
            ? t('admin.atlassian.sync.confirmWithParts', { parts: parts.join(', ') })
            : t('admin.atlassian.sync.confirmNoParts');
        })()}
        confirmLabel={t('admin.atlassian.sync.executeSync')}
        variant="danger"
      />
    </div>
  );
}

function AtlassianSyncPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 motion-safe:animate-pulse">
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

        <div className="rounded-xl border bg-card p-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <SkeletonBlock className="h-5 w-52 rounded-full" />
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </div>
          <SkeletonBlock className="h-2 w-full rounded-full" />
          <SkeletonBlock className="mt-3 h-4 w-28 rounded-full" />
        </div>

        <div className="rounded-xl border bg-card p-6">
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

        <div className="rounded-xl border bg-card p-6">
          <SkeletonBlock className="mb-4 h-6 w-32 rounded-full" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border/80 bg-background/70 px-4 py-3">
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
