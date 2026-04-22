import * as Popover from '@radix-ui/react-popover';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  VitIdStatus,
  MatchedVia,
  NeedsReviewReason,
  Auth0Candidate,
} from '@itatti/shared';

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
  const { label, tone, Icon } = getBadgeVisual(status);
  const tooltipCopy = getTooltipCopy({ status, matchedVia, matched, matchedViaEmail, reason });

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          tone
        )}
      >
        <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`What does "${label}" mean?`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 max-w-sm rounded-lg border bg-card p-3 text-[0.85rem] leading-5 text-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
          >
            <div className="mb-1.5 font-semibold">{tooltipCopy.title}</div>
            <p className="mb-2 text-muted-foreground">
              <span className="font-medium text-foreground">What&rsquo;s happening: </span>
              {tooltipCopy.whats}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">What to do: </span>
              {tooltipCopy.todo}
            </p>
            <Popover.Arrow className="fill-card" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function getBadgeVisual(status: VitIdStatus): {
  label: string;
  tone: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        tone: 'bg-green-50 text-green-700',
        Icon: CheckCircle2,
      };
    case 'active-different-email':
      return {
        label: 'Active (different email)',
        tone: 'bg-amber-50 text-amber-700',
        Icon: Info,
      };
    case 'needs-review':
      return {
        label: 'Needs review',
        tone: 'bg-amber-50 text-amber-800',
        Icon: AlertTriangle,
      };
    case 'no-account':
      return {
        label: 'No Account',
        tone: 'bg-red-50 text-red-700',
        Icon: XCircle,
      };
  }
}

interface TooltipCopy {
  title: string;
  whats: string;
  todo: string;
}

function getTooltipCopy(args: {
  status: VitIdStatus;
  matchedVia?: MatchedVia;
  matched?: Auth0Candidate;
  matchedViaEmail?: string;
  reason?: NeedsReviewReason;
}): TooltipCopy {
  const { status, matchedVia, matched, matchedViaEmail, reason } = args;
  const email = matched?.email ?? '';

  if (status === 'active') {
    return {
      title: 'Active VIT ID',
      whats: `This fellow has a VIT ID under their current email (${email}).`,
      todo: 'Nothing — the record is clean.',
    };
  }

  if (status === 'active-different-email') {
    if (matchedVia === 'civicrm-id') {
      return {
        title: 'VIT ID under a different email',
        whats: `This fellow has a VIT ID, but under a different email (${email}). They likely came back for another fellowship and their email changed.`,
        todo: `Confirm it's the same person (check the Auth0 account). If yes, use the existing VIT ID — don't create a new one.`,
      };
    }
    if (matchedVia === 'secondary-email') {
      return {
        title: 'VIT ID via secondary email',
        whats: `This fellow has a VIT ID under an email that CiviCRM still lists as a secondary address (${matchedViaEmail ?? email}). Their primary email changed but the old one is still on file.`,
        todo: 'Confirm the match and use the existing VIT ID.',
      };
    }
    if (matchedVia === 'name') {
      return {
        title: 'Probable VIT ID match by name',
        whats: `No email or CiviCRM ID match, but someone in Auth0 has the same name (${email}). This is a probable match, not a certain one.`,
        todo: `Eyeball the Auth0 account to confirm it's the same human. If yes, reuse the VIT ID and consider updating Auth0's email (and/or writing the CiviCRM contact id to app_metadata) so the match becomes deterministic next time.`,
      };
    }
  }

  if (status === 'needs-review') {
    if (reason === 'name-collision') {
      return {
        title: 'Needs review — name collision',
        whats: `More than one Auth0 user has the same name as this fellow. We can't tell which is the right one automatically.`,
        todo: 'Review the candidates below and pick the right match (or confirm none of them are this fellow and provision a new VIT ID).',
      };
    }
    if (reason === 'tier-conflict') {
      return {
        title: 'Needs review — data inconsistency',
        whats: `This fellow's CiviCRM ID points to one Auth0 account, but one of their old CiviCRM emails points to a different one. The data is inconsistent.`,
        todo: 'Look at both candidates below, decide which is correct, and reconcile the other (merge, delete, or leave as-is with a note).',
      };
    }
    if (reason === 'primary-conflict') {
      return {
        title: 'Needs review — two accounts for one person',
        whats: `This fellow's current CiviCRM email matches one Auth0 account, but their CiviCRM ID is stored on a different Auth0 account. Two records exist for the same person.`,
        todo: 'Review both candidates below and decide which VIT ID is the canonical one. The other likely needs to be merged or retired.',
      };
    }
    if (reason === 'duplicate-civicrm-contact') {
      return {
        title: 'Needs review — duplicate CiviCRM contact',
        whats: `This email is on two or more different contacts in CiviCRM. That usually means the same person was added twice (a duplicate contact). We can't safely match to a VIT ID until the duplicates are merged.`,
        todo: `Open CiviCRM's "Find and Merge Duplicate Contacts" tool, merge the duplicates for this person, then search again here.`,
      };
    }
  }

  if (status === 'no-account') {
    return {
      title: 'No VIT ID on file',
      whats: `We couldn't find a VIT ID for this fellow under any email, CiviCRM ID, or name we have on file.`,
      todo: 'Provision a new VIT ID as usual.',
    };
  }

  // Exhaustiveness fallback — should be unreachable when the union is complete.
  return {
    title: 'Unknown status',
    whats: 'This status was not recognized by the UI.',
    todo: 'Report this to the developers.',
  };
}
