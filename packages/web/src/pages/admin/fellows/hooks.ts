import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { FellowDashboardEntry } from '@itatti/shared';

function formLinkForToken(token: string): string {
  return `${window.location.origin}/forms/${token}`;
}

export function useCopyFormLink(fellow: FellowDashboardEntry) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  async function copyFormLink(
    token: string,
    options: {
      onCopyFailure?: () => void;
      failureMessage?: string;
    } = {}
  ): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(formLinkForToken(token));
      setCopied(true);
      toast.success(
        t('fellows.form.linkCopied', {
          name: `${fellow.firstName} ${fellow.lastName}`,
        })
      );
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      if (options.onCopyFailure) {
        options.onCopyFailure();
      } else {
        toast.error(options.failureMessage ?? t('fellows.form.copyFailed'));
      }
      return false;
    }
  }

  return { copied, copyFormLink };
}
