import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation, Trans } from 'react-i18next';
import { formatHumanDateTime } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useAutomationRuns, useStartDryRun, useExecuteAutomation } from '@/api/automations';
import type { AutomationRun, DryRunResult } from '@/api/automations';
import { userErrorMessage } from '@/lib/errors';
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

// i18n keys; resolved with t() where rendered. Unknown run types fall back to
// the raw type string from the API.
const TYPE_LABEL_KEYS: Record<string, string> = {
  'end-of-year-cleanup': 'admin.automations.typeEndOfYear',
  'new-cohort-onboarding': 'admin.automations.typeNewCohort',
  'backfill': 'admin.automations.typeBackfill',
};

export function AutomationsPage() {
  const { t } = useTranslation();
  const { data: runs, isLoading, error, refetch } = useAutomationRuns();

  if (isLoading) return <AutomationsSkeleton />;

  return (
    <div>
      <PageHeader
        title={t('admin.automations.title')}
        description={t('admin.automations.description')}
      />

      {/* Instructions */}
      <div className="mb-6 rounded-lg border border-border bg-secondary/45 p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="space-y-2 text-[0.95rem] leading-7 text-muted-foreground">
            <p>
              <Trans i18nKey="admin.automations.intro1" components={{ strong: <strong /> }} />
            </p>
            <p>
              <Trans
                i18nKey="admin.automations.intro2"
                components={{ strong: <strong />, em: <em /> }}
              />
            </p>
            <p>
              <Trans
                i18nKey="admin.automations.intro3"
                components={{ strong: <strong />, em: <em /> }}
              />
            </p>
            <p>
              <Trans i18nKey="admin.automations.intro4" components={{ strong: <strong /> }} />
            </p>
            <p>
              <Trans i18nKey="admin.automations.intro5" components={{ strong: <strong /> }} />
            </p>
          </div>
        </div>
      </div>

      {/* Automation Cards */}
      <div className="space-y-6">
        <AutomationCard
          type="end-of-year"
          title={t('admin.automations.typeEndOfYear')}
          description={t('admin.automations.cardEndOfYearDescription')}
          icon={<CalendarClock className="h-5 w-5 text-primary" />}
          schedule={t('admin.automations.scheduleJuly1')}
        />
        <AutomationCard
          type="new-cohort"
          title={t('admin.automations.typeNewCohort')}
          description={t('admin.automations.cardNewCohortDescription')}
          icon={<UserPlus className="h-5 w-5 text-primary" />}
          schedule={t('admin.automations.scheduleJuly2')}
        />
        <AutomationCard
          type="backfill"
          title={t('admin.automations.typeBackfill')}
          description={t('admin.automations.cardBackfillDescription')}
          icon={<Users className="h-5 w-5 text-primary" />}
        />
      </div>

      {/* History load error (non-blocking) */}
      {error && (
        <div className="mt-8 flex items-center gap-3 rounded-lg border border-warning-border bg-warning p-4 text-sm text-warning-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            {t('admin.automations.historyLoadError', {
              message: userErrorMessage(error, t),
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-warning-border bg-transparent text-warning-foreground hover:bg-warning-border/40 hover:text-warning-foreground"
            onClick={() => void refetch()}
          >
            <RefreshCw data-icon="inline-start" /> {t('common.retry')}
          </Button>
        </div>
      )}

      {/* History */}
      {runs && runs.length > 0 && (
        <div className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">{t('admin.automations.historyTitle')}</h2>
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
  const { t } = useTranslation();
  const dryRunMutation = useStartDryRun(type);
  const executeMutation = useExecuteAutomation(type);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDryRun = async () => {
    executeMutation.reset();
    setActionError(null);
    try {
      const result = await dryRunMutation.mutateAsync();
      setDryRunResult(result);
    } catch (err) {
      setActionError(t('admin.automations.previewFailed', { message: userErrorMessage(err, t) }));
    }
  };

  const handleExecute = async () => {
    if (!dryRunResult) return;
    setActionError(null);
    try {
      await executeMutation.mutateAsync(dryRunResult.runId);
      setDryRunResult(null);
    } catch (err) {
      // Keep the preview on screen: the admin needs to see what was attempted.
      setActionError(t('admin.automations.executionFailed', { message: userErrorMessage(err, t) }));
    }
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
            {t('admin.automations.auto', { schedule })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void handleDryRun()}
          disabled={dryRunMutation.isPending}
        >
          <RefreshCw data-icon="inline-start" className={dryRunMutation.isPending ? 'animate-spin' : ''} />
          {t('admin.automations.previewChanges')}
        </Button>

        {dryRunResult && dryRunResult.actions.length > 0 && (
          <Button
            type="button"
            size="lg"
            onClick={() => void handleExecute()}
            disabled={executeMutation.isPending}
          >
            <Play data-icon="inline-start" />
            {t('admin.automations.execute')}
          </Button>
        )}

        {dryRunResult && dryRunResult.actions.length === 0 && (
          <span className="text-sm text-muted-foreground">{t('admin.automations.noChangesNeeded')}</span>
        )}

        {executeMutation.isSuccess && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> {t('admin.automations.executedSuccessfully')}
          </span>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Dry run preview */}
      {dryRunResult && dryRunResult.actions.length > 0 && (
        <div className="mt-4 rounded-lg border bg-background p-4">
          <h4 className="text-sm font-medium mb-2">
            {t('admin.automations.previewActions', {
              count: dryRunResult.actions.length,
              year: dryRunResult.academicYear,
            })}
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
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    if (run.status === 'dry_run') return <Clock className="h-4 w-4 text-info" />;
    // A consumed dry run is a preview that was executed: done (check), but in
    // the preview family (info), matching the sync history's completed dry run.
    if (run.status === 'consumed') return <CheckCircle2 className="h-4 w-4 text-info" />;
    if (run.status === 'completed') return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (run.status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    if (run.status === 'partial') return <AlertCircle className="h-4 w-4 text-warning-foreground" />;
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
        <span className="text-sm font-medium">
          {TYPE_LABEL_KEYS[run.type] ? t(TYPE_LABEL_KEYS[run.type]) : run.type}
        </span>
        <span className="text-xs text-muted-foreground">
          {run.status === 'dry_run'
            ? t('admin.automations.dryRun')
            : run.status === 'consumed'
              ? t('admin.automations.dryRunExecuted')
              : t(`admin.status.${run.status}`, run.status)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatHumanDateTime(run.startedAt, i18n.language)}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {t('admin.automations.byUser', { user: run.triggeredBy })}
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
                <div key={i} className={`text-xs py-1 ${op.startsWith('ERROR') ? 'text-destructive' : op.startsWith('PENDING') ? 'text-warning-foreground' : ''}`}>
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
            <Download className="h-3 w-3" /> {t('admin.automations.exportJson')}
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
