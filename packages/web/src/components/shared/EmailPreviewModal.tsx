import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────────
// EmailPreviewModal
//
// Renders a read-only preview of what an appointee will receive before
// Angela clicks Send. Used for both the VIT ID invitation AND the bio
// & project description email.
//
// Three-state contract (the modal owns the lifecycle within one open
// session; the caller owns `open` and the fetch/send mutations):
//
//   loading        preview hasn't resolved yet (or is refetching)
//   previewError   preview endpoint refused (e.g. missing firstName);
//                  shows inline red banner with the reason + locked controls
//   sendError      preview rendered, but SES rejected the send; shows
//                  inline red banner + lets Angela retry without reopening
//
// The body HTML is rendered inside a sandboxed iframe so the email's
// styles cannot leak into the parent page. Height is measured after the
// iframe loads to avoid internal scrollbars — Angela sees the whole
// email at once.
// ──────────────────────────────────────────────────────────────────────

export interface EmailPreviewData {
  to: string;
  bcc: string[];
  subject: string;
  body: string;
  bodyFormat: 'html' | 'text';
}

interface EmailPreviewModalProps {
  open: boolean;
  title: string;
  confirmLabel?: string;
  notice?: string | null;
  /** Preview envelope. `null` = still loading. Provide a fresh value via react-query data. */
  preview: EmailPreviewData | null;
  /** Human-readable reason why the preview endpoint failed (e.g. "Missing first name in CiviCRM"). */
  previewError: string | null;
  /** Human-readable reason why the send endpoint failed on the last attempt. Nulled on open/retry. */
  sendError: string | null;
  /** True while the send mutation is in flight. Disables buttons + shows spinner. */
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function EmailPreviewModal({
  open,
  title,
  confirmLabel = 'Send email',
  notice,
  preview,
  previewError,
  sendError,
  submitting,
  onCancel,
  onConfirm,
}: EmailPreviewModalProps) {
  const sendDisabled =
    submitting || !preview || !!previewError;

  // Local dismissal flags — the parent owns previewError / sendError, but
  // lets Angela silence a banner for this open session without losing the
  // preview pane. Reset each time the modal opens so the banner reappears
  // after reopen if the error is still present.
  const [previewErrorDismissed, setPreviewErrorDismissed] = useState(false);
  const [sendErrorDismissed, setSendErrorDismissed] = useState(false);
  useEffect(() => {
    if (open) {
      setPreviewErrorDismissed(false);
      setSendErrorDismissed(false);
    }
  }, [open]);
  // Re-show a banner when its message changes (new error).
  useEffect(() => {
    setPreviewErrorDismissed(false);
  }, [previewError]);
  useEffect(() => {
    setSendErrorDismissed(false);
  }, [sendError]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !submitting) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(29,37,44,0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-0 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] duration-200 max-h-[92vh] flex flex-col">
          <header className="border-b px-6 py-4">
            <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </Dialog.Title>
          </header>

          {notice && (
            <InlineBanner
              tone="warning"
              icon={<AlertCircle className="h-4 w-4" />}
            >
              {notice}
            </InlineBanner>
          )}

          {previewError && !previewErrorDismissed && (
            <InlineBanner
              tone="destructive"
              icon={<AlertCircle className="h-4 w-4" />}
              onDismiss={() => setPreviewErrorDismissed(true)}
            >
              {previewError}
            </InlineBanner>
          )}
          {/* Suppress stale sendError while the preview is still loading — a
              red banner floating above a spinner is confusing when Angela
              reopens the modal for the same appointee after a failed send. */}
          {sendError && !previewError && preview !== null && !sendErrorDismissed && (
            <InlineBanner
              tone="destructive"
              icon={<AlertCircle className="h-4 w-4" />}
              onDismiss={() => setSendErrorDismissed(true)}
            >
              {sendError}
            </InlineBanner>
          )}

          <section className="border-b px-6 py-4 text-[0.92rem] space-y-1.5">
            <MetadataRow label="To" value={preview?.to ?? '…'} />
            <MetadataRow
              label="BCC"
              value={
                preview
                  ? preview.bcc.length > 0
                    ? preview.bcc.join(', ')
                    : '(none)'
                  : '…'
              }
              locked
            />
            <MetadataRow label="Subject" value={preview?.subject ?? '…'} />
          </section>

          <div
            className="flex-1 min-h-[320px] overflow-auto bg-muted/30 px-6 py-4"
            aria-busy={preview === null && !previewError}
          >
            {preview ? (
              preview.bodyFormat === 'html' ? (
                <SandboxedHtml body={preview.body} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[0.95rem] leading-6 text-foreground">
                  {preview.body}
                </pre>
              )
            ) : (
              // Loading affordance for sighted + AT users. aria-busy on the
              // parent announces the region as loading; the visually-hidden
              // <span> gives screen readers a concrete label since the
              // spinner icon alone isn't announced.
              <div
                role="status"
                className="flex h-full items-center justify-center text-muted-foreground"
              >
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Loading email preview…</span>
              </div>
            )}
          </div>

          <footer className="flex justify-end gap-3 border-t px-6 py-4">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm()}
              disabled={sendDisabled}
              className={cn(
                'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MetadataRow({
  label,
  value,
  locked,
}: {
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="min-w-[64px] text-muted-foreground">{label}</span>
      <span className="flex-1 break-all font-mono text-[0.88rem]">{value}</span>
      {locked && (
        <span
          className="inline-flex items-center gap-1 text-[0.75rem] text-muted-foreground"
          title="BCC list is managed by APPOINTEE_EMAIL_BCC and cannot be edited here."
        >
          <Lock className="h-3 w-3" />
          locked
        </span>
      )}
    </div>
  );
}

function InlineBanner({
  tone,
  icon,
  children,
  onDismiss,
}: {
  tone: 'destructive' | 'warning';
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** When provided, renders a close (X) button that calls onDismiss. */
  onDismiss?: () => void;
}) {
  const liveRegionProps =
    tone === 'warning'
      ? ({ role: 'status', 'aria-live': 'polite' } as const)
      : ({ role: 'alert', 'aria-live': 'assertive' } as const);

  return (
    <div
      {...liveRegionProps}
      className={cn(
        'mx-6 mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[0.88rem]',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive',
        tone === 'warning' && 'border-amber-300 bg-amber-50 text-amber-900'
      )}
    >
      {icon && <span className="mt-0.5 flex-shrink-0">{icon}</span>}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Sandboxed iframe preview. Height is measured after each body change so the
 * iframe shows the full email without its own scrollbar. `allow-same-origin`
 * lets us measure `contentDocument.body.scrollHeight`; sandbox still blocks
 * script execution from the iframe.
 */
function SandboxedHtml({ body }: { body: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  const measure = () => {
    const iframe = ref.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      // Use the tallest element available so tables + outer div both count.
      const h = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
        320
      );
      setHeight(h);
    } catch {
      // same-origin sandbox can still throw on some clients; fall back.
      setHeight(600);
    }
  };

  // React's onLoad prop (below) is the primary measurement path. This
  // useEffect handles two extra cases: (1) the srcDoc is tiny enough that
  // the iframe 'load' fires synchronously, before React attaches onLoad,
  // and (2) the body prop changes without triggering a new load event
  // (not expected with srcDoc, but cheap insurance).
  //
  // Deferred via requestAnimationFrame because srcDoc parsing is async —
  // reading contentDocument synchronously after the body prop changes
  // can see the PREVIOUS document. One frame is enough for the browser
  // to commit the new doc.
  useEffect(() => {
    const raf = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(raf);
  }, [body]);

  return (
    <iframe
      ref={ref}
      srcDoc={body}
      sandbox="allow-same-origin"
      title="Email preview"
      className="w-full rounded-md border bg-white"
      style={{ height }}
      onLoad={measure}
    />
  );
}
