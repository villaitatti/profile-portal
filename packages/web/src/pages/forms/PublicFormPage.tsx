import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicForm, useSubmitForm } from '@/api/forms';
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
  const initialStatusRef = useRef<string | null>(null);
  if (data && initialStatusRef.current === null) {
    initialStatusRef.current = data.status;
  }

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
          This link may be invalid or expired. Please contact the I Tatti office if you need assistance.
        </p>
      </div>
    );
  }

  // Only show "already submitted" when the link was ALREADY submitted
  // BEFORE this page session started. Do NOT render this after a
  // just-completed submit — that path is owned by PublicFormRenderer's
  // isSuccess branch (the "Thank you!" screen).
  if (initialStatusRef.current === 'submitted') {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Form Already Submitted</h1>
        <p className="text-muted-foreground">
          This form was submitted on {new Date(data.submittedAt!).toLocaleDateString()}.
          If you need to make changes, please contact the I Tatti office.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">{data.formDef.title}</h1>
        {data.formDef.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
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
