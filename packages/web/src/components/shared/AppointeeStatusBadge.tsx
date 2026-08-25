import { Check, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AppointeeStatus } from '@itatti/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ──────────────────────────────────────────────────────────────────────
// AppointeeStatusBadge
//
// Renders the Appointee Lifecycle chip on the Manage Appointees dashboard.
// Orthogonal to VitIdStatusBadge — that one shows data-quality signals
// (match ladder tier); THIS one shows "what step of onboarding are they on?"
//
// Seven states, palette sourced from globals.css brand tokens:
//   nominated         gray     waiting on Angela's external workflow
//   nomination-sent   secondary nomination sent, form pending
//   form-submitted    indigo   form done, ready for acceptance
//   accepted          blue     VIT ID invitation ready to send
//   vit-id-sent       amber    waiting on the appointee to claim
//   vit-id-claimed    lime     VIT ID active, bio email next
//   enrolled          green    terminal success — onboarding complete
// ──────────────────────────────────────────────────────────────────────

interface AppointeeStatusBadgeProps {
  status: AppointeeStatus;
  /** Optional: rendered as a small muted sub-label under the chip. Used for
   *  "Last send failed" beneath an Accepted chip when a VIT invitation FAILED. */
  subLabel?: string;
  subLabelTone?: 'destructive' | 'muted';
}

export function AppointeeStatusBadge({
  status,
  subLabel,
  subLabelTone = 'muted',
}: AppointeeStatusBadgeProps) {
  const { t } = useTranslation();
  const { labelKey, tone, titleKey } = VISUAL[status];
  const label = t(labelKey);
  const title = t(titleKey);
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex flex-col items-start gap-1">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium',
            tone
          )}
          title={title}
        >
          {label}
        </span>
        {subLabel && (
          <span
            className={cn(
              'text-[0.82rem] leading-4',
              subLabelTone === 'destructive'
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {subLabel}
          </span>
        )}
      </div>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t('fellows.badges.appointee.lifecycleAria')}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          }
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          sideOffset={6}
          className="w-72 gap-0 p-4 text-[0.88rem] leading-5"
        >
          <div className="mb-3 font-semibold text-sm">{t('fellows.badges.appointee.lifecycleTitle')}</div>
          <div className="space-y-0">
            {/*
              Completed, current, and future steps need distinct visual
              language. Without this, past steps look identical to future
              steps when the current lifecycle state is in the middle.
            */}
            {(() => {
              const currentIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === status);
              // Enrolled is the terminal success state — there are no more
              // actions. Render it as a completed step (green + check) rather
              // than as the "current" step so it doesn't look like work-in-progress.
              const isTerminal = status === 'enrolled';
              return LIFECYCLE_STEPS.map((step, i) => {
                const isCurrent = step.key === status && !isTerminal;
                const isComplete = isTerminal ? i <= currentIndex : i < currentIndex;
                return (
                  <div key={step.key} className="flex items-start gap-2">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2',
                          isCurrent
                            ? 'border-primary bg-primary'
                            : isComplete
                              ? 'border-green-600 bg-green-600 dark:border-green-500 dark:bg-green-500'
                              : 'border-muted-foreground/40 bg-background'
                        )}
                      >
                        {isComplete && (
                          <Check
                            className="h-2.5 w-2.5 text-primary-foreground dark:text-green-950"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && (
                        <div
                          className={cn(
                            'h-4 w-0.5',
                            i < currentIndex ? 'bg-green-600/60 dark:bg-green-500/60' : 'bg-muted-foreground/20'
                          )}
                        />
                      )}
                    </div>
                    <div className={cn('pb-2', isCurrent && 'font-medium')}>
                      <span
                        className={cn(
                          isCurrent
                            ? 'text-primary'
                            : isComplete
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-foreground'
                        )}
                      >
                        {t(step.labelKey)}
                      </span>
                      <span className="block text-[0.82rem] text-muted-foreground">
                        {t(step.descriptionKey)}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const VISUAL: Record<
  AppointeeStatus,
  { labelKey: string; tone: string; titleKey: string }
> = {
  nominated: {
    labelKey: 'fellows.status.nominated',
    tone: 'bg-muted text-muted-foreground',
    titleKey: 'fellows.badges.appointee.titles.nominated',
  },
  'nomination-sent': {
    labelKey: 'fellows.status.nominationSent',
    tone: 'bg-secondary text-secondary-foreground',
    titleKey: 'fellows.badges.appointee.titles.nominationSent',
  },
  'form-submitted': {
    labelKey: 'fellows.status.formSubmitted',
    tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    titleKey: 'fellows.badges.appointee.titles.formSubmitted',
  },
  accepted: {
    labelKey: 'fellows.status.accepted',
    tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    titleKey: 'fellows.badges.appointee.titles.accepted',
  },
  'vit-id-sent': {
    labelKey: 'fellows.status.vitIdSent',
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    titleKey: 'fellows.badges.appointee.titles.vitIdSent',
  },
  'vit-id-claimed': {
    labelKey: 'fellows.status.vitIdClaimed',
    tone: 'bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
    titleKey: 'fellows.badges.appointee.titles.vitIdClaimed',
  },
  enrolled: {
    labelKey: 'fellows.status.enrolled',
    tone: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    titleKey: 'fellows.badges.appointee.titles.enrolled',
  },
};

const LIFECYCLE_STEPS: { key: AppointeeStatus; labelKey: string; descriptionKey: string }[] = [
  { key: 'nominated', labelKey: 'fellows.status.nominated', descriptionKey: 'fellows.badges.appointee.steps.nominated' },
  { key: 'nomination-sent', labelKey: 'fellows.status.nominationSent', descriptionKey: 'fellows.badges.appointee.steps.nominationSent' },
  { key: 'form-submitted', labelKey: 'fellows.status.formSubmitted', descriptionKey: 'fellows.badges.appointee.steps.formSubmitted' },
  { key: 'accepted', labelKey: 'fellows.status.accepted', descriptionKey: 'fellows.badges.appointee.steps.accepted' },
  { key: 'vit-id-sent', labelKey: 'fellows.status.vitIdSent', descriptionKey: 'fellows.badges.appointee.steps.vitIdSent' },
  { key: 'vit-id-claimed', labelKey: 'fellows.status.vitIdClaimed', descriptionKey: 'fellows.badges.appointee.steps.vitIdClaimed' },
  { key: 'enrolled', labelKey: 'fellows.status.enrolled', descriptionKey: 'fellows.badges.appointee.steps.enrolled' },
];
