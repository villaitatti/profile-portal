import * as Popover from '@radix-ui/react-popover';
import { Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppointeeStatus } from '@itatti/shared';

// ──────────────────────────────────────────────────────────────────────
// AppointeeStatusBadge
//
// Renders the Appointee Lifecycle chip on the Manage Appointees dashboard.
// Orthogonal to VitIdStatusBadge — that one shows data-quality signals
// (match ladder tier); THIS one shows "what step of onboarding are they on?"
//
// Seven states, palette sourced from globals.css brand tokens:
//   nominated         gray     waiting on Angela's external workflow
//   nomination-sent   slate    nomination sent, form pending
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
  const { label, tone, title } = VISUAL[status];
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex flex-col items-start gap-1">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            tone
          )}
          title={title}
        >
          {label}
        </span>
        {subLabel && (
          <span
            className={cn(
              'text-[0.75rem] leading-4',
              subLabelTone === 'destructive'
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {subLabel}
          </span>
        )}
      </div>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="View appointee lifecycle stages"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 w-72 rounded-lg border bg-card p-4 text-[0.82rem] leading-5 text-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
          >
            <div className="mb-3 font-semibold text-sm">Appointee Lifecycle</div>
            <div className="space-y-0">
              {/*
                Completed, current, and future steps need distinct visual
                language. Without this, past steps look identical to future
                steps when the current lifecycle state is in the middle.
              */}
              {(() => {
                const currentIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === status);
                return LIFECYCLE_STEPS.map((step, i) => {
                  const isCurrent = step.key === status;
                  const isComplete = i < currentIndex;
                  return (
                    <div key={step.key} className="flex items-start gap-2">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2',
                            isCurrent
                              ? 'border-primary bg-primary'
                              : isComplete
                                ? 'border-green-600 bg-green-600'
                                : 'border-muted-foreground/40 bg-background'
                          )}
                        >
                          {isComplete && (
                            <Check className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                          )}
                        </div>
                        {i < LIFECYCLE_STEPS.length - 1 && (
                          <div
                            className={cn(
                              'h-4 w-0.5',
                              i < currentIndex ? 'bg-green-600/60' : 'bg-muted-foreground/20'
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
                                ? 'text-green-700'
                                : 'text-foreground'
                          )}
                        >
                          {step.label}
                        </span>
                        <span className="block text-[0.75rem] text-muted-foreground">
                          {step.description}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <Popover.Arrow className="fill-card" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

const VISUAL: Record<
  AppointeeStatus,
  { label: string; tone: string; title: string }
> = {
  nominated: {
    label: 'Nominated',
    tone: 'bg-muted text-muted-foreground',
    title: 'Waiting on Angela: send the nomination letter and forms.',
  },
  'nomination-sent': {
    label: 'Nomination Sent',
    tone: 'bg-slate-100 text-slate-700',
    title: 'Nomination letter sent. Waiting for appointee to submit the form.',
  },
  'form-submitted': {
    label: 'Form Submitted',
    tone: 'bg-indigo-50 text-indigo-700',
    title: 'Appointee submitted the required form. Ready for Angela to accept the fellowship.',
  },
  accepted: {
    label: 'Accepted',
    tone: 'bg-blue-50 text-blue-700',
    title: 'Fellowship accepted. Ready to send the VIT ID invitation email.',
  },
  'vit-id-sent': {
    label: 'VIT ID Sent',
    tone: 'bg-amber-50 text-amber-700',
    title: 'Invitation email sent. Waiting on the appointee to claim their VIT ID.',
  },
  'vit-id-claimed': {
    label: 'VIT ID Claimed',
    tone: 'bg-lime-50 text-lime-700',
    title:
      'VIT ID is active. Ready to send the bio & project description email (or wait for the cron).',
  },
  enrolled: {
    label: 'Enrolled',
    tone: 'bg-green-50 text-green-700',
    title: 'VIT ID active and bio email sent. Onboarding complete.',
  },
};

const LIFECYCLE_STEPS: { key: AppointeeStatus; label: string; description: string }[] = [
  { key: 'nominated', label: 'Nominated', description: 'Generate form link and send nomination letter' },
  { key: 'nomination-sent', label: 'Nomination Sent', description: 'Waiting for appointee to submit the form' },
  { key: 'form-submitted', label: 'Form Submitted', description: 'Accept the fellowship in CiviCRM' },
  { key: 'accepted', label: 'Accepted', description: 'Send the VIT ID invitation email' },
  { key: 'vit-id-sent', label: 'VIT ID Sent', description: 'Waiting for appointee to claim VIT ID' },
  { key: 'vit-id-claimed', label: 'VIT ID Claimed', description: 'Send bio & project description email' },
  { key: 'enrolled', label: 'Enrolled', description: 'Onboarding complete' },
];
