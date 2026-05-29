import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicForm, useSubmitForm, type PublicFormData } from '@/api/forms';
import { PublicFormRenderer } from './PublicFormRenderer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CheckCircle2 } from 'lucide-react';

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = usePublicForm(token || '');
  const submitMutation = useSubmitForm(token || '');

  // Snapshot the invitation's status the FIRST time the page loads this
  // token. The submit mutation's onSuccess callback invalidates the
  // ['public-form', token] query, which refetches and returns
  // status: 'submitted'. Without this snapshot, the submitted-status
  // branch below would preempt the renderer's "Thank you!" success screen
  // the moment the POST resolves — so a user who just successfully
  // submitted would see "Form Already Submitted" instead. The ref
  // distinguishes "opened an already-used link" (show re-visit message)
  // from "just submitted successfully" (show the renderer's success state).
  //
  // Keyed by token so an in-place navigation between two different form
  // URLs (/forms/A → /forms/B) doesn't carry A's snapshot into B. Without
  // the key, a submitted link opened first and then a fresh link opened
  // second via SPA navigation would incorrectly show "Already Submitted"
  // on the fresh one.
  //
  // Typed as the domain union (not string) so a rename/removal of a
  // status value fails typecheck here instead of quietly comparing
  // against a stale literal in the branch below.
  const initialStatusRef = useRef<{ token: string; status: PublicFormData['status'] } | null>(null);
  if (data && token && initialStatusRef.current?.token !== token) {
    initialStatusRef.current = { token, status: data.status };
  }
  const initialStatus = initialStatusRef.current?.status ?? null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-2">Form Not Found</h1>
        <p className="text-muted-foreground">
          This link may be invalid or expired. Please contact the I Tatti staff member who sent you this form.
        </p>
      </div>
    );
  }

  // Only show "already submitted" when the link was ALREADY submitted
  // BEFORE this page session started. Do NOT render this after a
  // just-completed submit — that path is owned by PublicFormRenderer's
  // isSuccess branch (the "Thank you!" screen).
  if (initialStatus === 'submitted') {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Form Already Submitted</h1>
        <p className="text-muted-foreground">
          This form was submitted on {new Date(data.submittedAt!).toLocaleDateString()}.
          If you need to make changes, please contact the I Tatti staff member who sent you this form.
        </p>
      </div>
    );
  }

  // Post-submit: the renderer owns the full-page success screen. Hide the
  // form's title + privacy-policy block above it so the appointee sees one
  // clean "Thank you" panel instead of a half-form, half-confirmation view.
  // Only props relevant to the success screen are passed — the rest (onSubmit,
  // isSubmitting, submitError) are only read when the renderer draws the form.
  if (submitMutation.isSuccess) {
    return (
      <div className="mx-auto max-w-4xl">
        <PublicFormRenderer
          formDef={data.formDef}
          onSubmit={() => undefined}
          isSubmitting={false}
          isSuccess={true}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 border-b border-primary/15 pb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-primary">
          Fellowship form
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{data.formDef.title}</h1>
        {data.formDef.description && (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {data.formDef.description}
          </p>
        )}
      </div>

      <PublicFormRenderer
        formDef={data.formDef}
        onSubmit={(formData) => submitMutation.mutate(formData)}
        isSubmitting={submitMutation.isPending}
        submitError={submitMutation.error?.message}
        isSuccess={submitMutation.isSuccess}
      />
    </div>
  );
}
