import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useAutomationRuns, useStartDryRun, useExecuteAutomation } from '@/api/automations';
import type { AutomationRun, DryRunResult } from '@/api/automations';
import {
  Info,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  CalendarClock,
  Users,
  UserPlus,
} from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  'end-of-year-cleanup': 'End-of-Year Cleanup',
  'new-cohort-onboarding': 'New Cohort Onboarding',
  'backfill': 'Backfill Existing Fellows',
};

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function AutomationsPage() {
  const { data: runs, isLoading, error, refetch } = useAutomationRuns();

  if (isLoading) return <AutomationsSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader title="Appointees Automations" />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">Failed to load automations</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Appointees Automations"
        description="Manage academic year transitions and JSM organization membership"
      />

      {/* Instructions */}
      <div className="mb-6 rounded-lg border border-border bg-secondary/45 p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="space-y-2 text-[0.95rem] leading-7 text-muted-foreground">
            <p>
              <strong>End-of-Year Cleanup</strong> runs automatically on July 1 at 4:00 AM UTC.
              It removes departing fellows from the <em>fellows-current</em> Auth0 role and the
              "I Tatti Current Appointees" organizations on both Atlassian Cloud JSM sites.
              Fellows keep their <em>fellows</em> role and "Former Appointees" membership.
            </p>
            <p>
              <strong>New Cohort Onboarding</strong> runs automatically on July 2 at 4:00 AM UTC.
              It adds arriving fellows (with a VIT ID) to the <em>fellows-current</em> Auth0 role
              and the "I Tatti Current Appointees" organizations. Fellows without a VIT ID are
              listed as "pending" in the report.
            </p>
            <p>
              <strong>Backfill Existing Fellows</strong> is a one-time action for the Phase 2 migration.
              It adds all existing fellows (who claimed their VIT ID before this feature was deployed)
              to the correct JSM organizations.
            </p>
            <p>
              All automations use a <strong>dry-run → execute</strong> pattern. Run the dry run first
              to preview what will change, then execute to apply. Dry runs are safe in any environment.
              Execution only works in production.
            </p>
          </div>
        </div>
      </div>

      {/* Automation Cards */}
      <div className="space-y-6">
        <AutomationCard
          type="end-of-year"
          title="End-of-Year Cleanup"
          description="Remove departing fellows from Current Appointees"
          icon={<CalendarClock className="h-5 w-5 text-primary" />}
          schedule="July 1, 04:00 UTC"
        />
        <AutomationCard
          type="new-cohort"
          title="New Cohort Onboarding"
          description="Add arriving fellows to Current Appointees"
          icon={<UserPlus className="h-5 w-5 text-primary" />}
          schedule="July 2, 04:00 UTC"
        />
        <AutomationCard
          type="backfill"
          title="Backfill Existing Fellows"
          description="One-time: add pre-existing fellows to JSM organizations"
          icon={<Users className="h-5 w-5 text-primary" />}
        />
      </div>

      {/* History */}
      {runs && runs.length > 0 && (
        <div className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Automation History</h2>
          <div className="space-y-2">
            {runs.map((run) => (
              <HistoryRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AutomationCard({
  type,
  title,
  description,
  icon,
  schedule,
}: {
  type: 'end-of-year' | 'new-cohort' | 'backfill';
  title: string;
  description: string;
  icon: React.ReactNode;
  schedule?: string;
}) {
  const dryRunMutation = useStartDryRun(type);
  const executeMutation = useExecuteAutomation(type);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  const handleDryRun = async () => {
    executeMutation.reset();
    const result = await dryRunMutation.mutateAsync();
    setDryRunResult(result);
  };

  const handleExecute = async () => {
    if (!dryRunResult) return;
    await executeMutation.mutateAsync(dryRunResult.runId);
    setDryRunResult(null);
  };

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="text-[0.92rem] text-muted-foreground">{description}</p>
          </div>
        </div>
        {schedule && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Auto: {schedule}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleDryRun}
          disabled={dryRunMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${dryRunMutation.isPending ? 'animate-spin' : ''}`} />
          Preview Changes
        </button>

        {dryRunResult && dryRunResult.actions.length > 0 && (
          <button
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Execute
          </button>
        )}

        {dryRunResult && dryRunResult.actions.length === 0 && (
          <span className="text-sm text-muted-foreground">No changes needed.</span>
        )}

        {executeMutation.isSuccess && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Executed successfully
          </span>
        )}
      </div>

      {/* Dry run preview */}
      {dryRunResult && dryRunResult.actions.length > 0 && (
        <div className="mt-4 rounded-lg border bg-background p-4">
          <h4 className="text-sm font-medium mb-2">
            Preview: {dryRunResult.actions.length} action{dryRunResult.actions.length !== 1 ? 's' : ''} ({dryRunResult.academicYear})
          </h4>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {dryRunResult.actions.map((action, i) => (
              <div key={i} className="text-sm py-1 border-b last:border-0">
                <span className="font-medium">{action.name}</span>
                <span className="text-muted-foreground ml-2">({action.email})</span>
                <span className="text-muted-foreground ml-2">— {action.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ run }: { run: AutomationRun }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    if (run.status === 'dry_run') return <Clock className="h-4 w-4 text-blue-500" />;
    if (run.status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (run.status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    if (run.status === 'partial') return <AlertCircle className="h-4 w-4 text-amber-500" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {statusIcon()}
        <span className="text-sm font-medium">{TYPE_LABELS[run.type] || run.type}</span>
        <span className="text-xs text-muted-foreground">
          {run.status === 'dry_run' ? 'Dry run' : run.status}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(run.startedAt)}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          by {run.triggeredBy}
        </span>
      </button>

      {expanded && (
        <div className="border-t p-3 text-sm">
          {run.stats && (
            <div className="flex flex-wrap gap-4 mb-3 text-xs">
              {Object.entries(run.stats as Record<string, number>).map(([key, value]) => (
                <span key={key} className="text-muted-foreground">
                  {key}: {value}
                </span>
              ))}
            </div>
          )}

          {run.result?.operations && Array.isArray(run.result.operations) && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {(run.result.operations as string[]).map((op, i) => (
                <div key={i} className={`text-xs py-1 ${op.startsWith('ERROR') ? 'text-destructive' : op.startsWith('PENDING') ? 'text-amber-600' : ''}`}>
                  {op}
                </div>
              ))}
            </div>
          )}

          {run.result?.actions && Array.isArray(run.result.actions) && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {(run.result.actions as { email: string; name: string; action: string }[]).map((a, i) => (
                <div key={i} className="text-xs py-1 border-b last:border-0">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground ml-1">({a.email})</span>
                  <span className="text-muted-foreground ml-1">— {a.action}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `automation-run-${run.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3 w-3" /> Export JSON
          </button>
        </div>
      )}
    </div>
  );
}

function AutomationsSkeleton() {
  return (
    <div className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-64 rounded-full" />
        <SkeletonBlock className="h-5 w-[30rem] max-w-full rounded-full" />
      </div>
      <div className="rounded-lg border border-border bg-secondary/45 p-5">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-full rounded-full" />
          <SkeletonBlock className="h-4 w-11/12 rounded-full" />
          <SkeletonBlock className="h-4 w-10/12 rounded-full" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <SkeletonBlock className="h-5 w-5 rounded-full" />
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-48 rounded-full" />
              <SkeletonBlock className="h-4 w-72 rounded-full" />
            </div>
          </div>
          <SkeletonBlock className="h-10 w-36 rounded-md" />
        </div>
      ))}
    </div>
  );
}
