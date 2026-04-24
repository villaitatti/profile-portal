import { cn } from '@/lib/utils';
import type { AppointeeStatus } from '@itatti/shared';

// ──────────────────────────────────────────────────────────────────────
// AppointeeStatusBadge
//
// Renders the Appointee Lifecycle chip on the Manage Appointees dashboard.
// Orthogonal to VitIdStatusBadge — that one shows data-quality signals
// (match ladder tier); THIS one shows "what step of onboarding are they on?"
//
// Five states, palette sourced from globals.css brand tokens:
//   nominated       gray      waiting on Angela's external workflow
//   accepted        blue      VIT ID invitation ready to send
//   vit-id-sent     amber     waiting on the appointee to claim
//   vit-id-claimed  lime      VIT ID active, bio email next
//   enrolled        green     terminal success — onboarding complete
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
  );
}

const VISUAL: Record<
  AppointeeStatus,
  { label: string; tone: string; title: string }
> = {
  nominated: {
    label: 'Nominated',
    // Muted institutional grey — waiting; no action available yet.
    tone: 'bg-muted text-muted-foreground',
    title:
      'Waiting on Angela: send the nomination letter and forms (outside the portal for now).',
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
