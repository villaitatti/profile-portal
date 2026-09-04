import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import type {
  VitIdStatus,
  MatchedVia,
  NeedsReviewReason,
  Auth0Candidate,
} from '@itatti/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ──────────────────────────────────────────────────────────────────────
// VitIdStatusBadge
//
// Renders a status pill + info-icon popover for any VIT ID match result.
// Used on both the Manage Appointees dashboard and the Has VIT ID? page
// so the visual language and help copy stay identical.
//
// Semantic color model:
//   green  = clean, nothing to do
//   amber  = works but needs a human eyeball
//   red    = staff must act (no VIT ID exists)
//
// Both 'active-different-email' and 'needs-review' are amber variants
// because neither blocks the user; they flag ambiguity that, if ignored,
// leads to duplicate VIT IDs.
// ──────────────────────────────────────────────────────────────────────

interface VitIdStatusBadgeProps {
  status: VitIdStatus;
  matchedVia?: MatchedVia;
  matched?: Auth0Candidate;
  matchedViaEmail?: string;
  reason?: NeedsReviewReason;
  candidates?: Auth0Candidate[];
}

export function VitIdStatusBadge({
  status,
  matchedVia,
  matched,
  matchedViaEmail,
  reason,
}: VitIdStatusBadgeProps) {
  const { t } = useTranslation();
  const { label, tone, Icon } = getBadgeVisual(status, t);
  const tooltipCopy = getTooltipCopy({ status, matchedVia, matched, matchedViaEmail, reason }, t);

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium',
          tone
        )}
      >
        <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={t('fellows.badges.vitId.whatMeansAria', { label })}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          }
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          sideOffset={6}
          className="w-auto max-w-sm gap-0 p-3 text-[0.9rem] leading-5"
        >
          <div className="mb-1.5 font-semibold">{tooltipCopy.title}</div>
          <p className="mb-2 text-muted-foreground">
            <span className="font-medium text-foreground">{t('fellows.badges.vitId.whatsHappening')} </span>
            {tooltipCopy.whats}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{t('fellows.badges.vitId.whatToDo')} </span>
            {tooltipCopy.todo}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getBadgeVisual(
  status: VitIdStatus,
  t: TFunction
): {
  label: string;
  tone: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'active':
      return {
        label: t('fellows.badges.vitId.active'),
        tone: 'tone-success',
        Icon: CheckCircle2,
      };
    case 'active-different-email':
      return {
        label: t('fellows.badges.vitId.activeDifferentEmail'),
        tone: 'tone-warning',
        Icon: Info,
      };
    case 'needs-review':
      return {
        label: t('fellows.badges.vitId.needsReview'),
        tone: 'tone-warning',
        Icon: AlertTriangle,
      };
    case 'no-account':
      return {
        label: t('fellows.badges.vitId.noAccount'),
        tone: 'tone-danger',
        Icon: XCircle,
      };
  }
}

interface TooltipCopy {
  title: string;
  whats: string;
  todo: string;
}

function getTooltipCopy(
  args: {
    status: VitIdStatus;
    matchedVia?: MatchedVia;
    matched?: Auth0Candidate;
    matchedViaEmail?: string;
    reason?: NeedsReviewReason;
  },
  t: TFunction
): TooltipCopy {
  const { status, matchedVia, matched, matchedViaEmail, reason } = args;
  const email = matched?.email ?? '';
  const tip = 'fellows.badges.vitId.tooltip';

  if (status === 'active') {
    return {
      title: t(`${tip}.activeTitle`),
      whats: t(`${tip}.activeWhats`, { email }),
      todo: t(`${tip}.activeTodo`),
    };
  }

  if (status === 'active-different-email') {
    if (matchedVia === 'civicrm-id') {
      return {
        title: t(`${tip}.diffCivicrmTitle`),
        whats: t(`${tip}.diffCivicrmWhats`, { email }),
        todo: t(`${tip}.diffCivicrmTodo`),
      };
    }
    if (matchedVia === 'secondary-email') {
      return {
        title: t(`${tip}.diffSecondaryTitle`),
        whats: t(`${tip}.diffSecondaryWhats`, { email: matchedViaEmail ?? email }),
        todo: t(`${tip}.diffSecondaryTodo`),
      };
    }
    if (matchedVia === 'name') {
      return {
        title: t(`${tip}.diffNameTitle`),
        whats: t(`${tip}.diffNameWhats`, { email }),
        todo: t(`${tip}.diffNameTodo`),
      };
    }
  }

  if (status === 'needs-review') {
    if (reason === 'name-collision') {
      return {
        title: t(`${tip}.nameCollisionTitle`),
        whats: t(`${tip}.nameCollisionWhats`),
        todo: t(`${tip}.nameCollisionTodo`),
      };
    }
    if (reason === 'tier-conflict') {
      return {
        title: t(`${tip}.tierConflictTitle`),
        whats: t(`${tip}.tierConflictWhats`),
        todo: t(`${tip}.tierConflictTodo`),
      };
    }
    if (reason === 'primary-conflict') {
      return {
        title: t(`${tip}.primaryConflictTitle`),
        whats: t(`${tip}.primaryConflictWhats`),
        todo: t(`${tip}.primaryConflictTodo`),
      };
    }
    if (reason === 'duplicate-civicrm-contact') {
      return {
        title: t(`${tip}.duplicateContactTitle`),
        whats: t(`${tip}.duplicateContactWhats`),
        todo: t(`${tip}.duplicateContactTodo`),
      };
    }
  }

  if (status === 'no-account') {
    return {
      title: t(`${tip}.noAccountTitle`),
      whats: t(`${tip}.noAccountWhats`),
      todo: t(`${tip}.noAccountTodo`),
    };
  }

  // Exhaustiveness fallback — should be unreachable when the union is complete.
  return {
    title: t(`${tip}.unknownTitle`),
    whats: t(`${tip}.unknownWhats`),
    todo: t(`${tip}.unknownTodo`),
  };
}
