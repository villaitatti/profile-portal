import { useParams } from 'react-router-dom';
import { PublicFormRequestError, usePublicForm, useSubmitForm } from '@/api/forms';
import { PublicFormRenderer } from './PublicFormRenderer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CheckCircle2 } from 'lucide-react';

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isFetching, error, refetch } = usePublicForm(token || '');
  const submitMutation = useSubmitForm(token || '');

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !data) {
    const status = error instanceof PublicFormRequestError ? error.status : undefined;
    const isExpired = status === 410;
    const isInvalid = status === 404;
    const isRateLimited = status === 429;
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">
          {isExpired
            ? 'Form Link Expired'
            : isInvalid
              ? 'Form Not Found'
              : isRateLimited
                ? 'Too Many Requests'
                : 'Form Temporarily Unavailable'}
        </h1>
        <p className="text-muted-foreground">
          {isExpired || isInvalid
            ? 'This link is no longer active. Please contact the I Tatti staff member who sent you this form.'
            : isRateLimited
              ? 'Please wait a few minutes before trying this form link again.'
              : 'We could not load the form right now. Please check your connection and try again.'}
        </p>
        {!isExpired && !isInvalid && (
          <button
            type="button"
            className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Trying again…' : 'Try again'}
          </button>
        )}
      </div>
    );
  }

  // A local success always owns the confirmation screen. Server status remains
  // authoritative for expiry or submission from another browser/tab.
  if (submitMutation.isSuccess) {
    return (
      <div className="mx-auto max-w-5xl">
        <PublicFormRenderer
          formDef={data.formDef}
          onSubmit={() => undefined}
          isSubmitting={false}
          isSuccess={true}
        />
      </div>
    );
  }

  if (data.status === 'submitted') {
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

  if (data.status === 'expired') {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">Form Link Expired</h1>
        <p className="text-muted-foreground">
          For your privacy, this form link is no longer active. Please contact the I Tatti staff
          member who sent it to request a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
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
