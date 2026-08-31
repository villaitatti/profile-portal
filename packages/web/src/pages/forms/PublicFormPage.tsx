import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { formatHumanDate } from '@/lib/dates';
import { PublicFormRequestError, PublicFormSubmitError, usePublicForm, useSubmitForm } from '@/api/forms';
import { PublicFormRenderer, FormSubmittedPanel } from './PublicFormRenderer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CheckCircle2 } from 'lucide-react';

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  // Keyed on the token so an in-place navigation between two form links
  // remounts: submit state lives inside PublicFormView, and link B must never
  // inherit link A's confirmation screen.
  return <PublicFormView key={token ?? ''} token={token ?? ''} />;
}

function PublicFormView({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const submitMutation = useSubmitForm(token);
  const { data, isLoading, isFetching, error, refetch } = usePublicForm(token, {
    refetchOnWindowFocus: !submitMutation.isSuccess,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  // A local success always owns the confirmation screen, so this branch comes
  // before the load-error one: the server rotates the token on submit, so a
  // later refetch 404s and must not replace the confirmation with
  // "Form Not Found".
  if (submitMutation.isSuccess) {
    return (
      <div className="mx-auto max-w-5xl">
        <FormSubmittedPanel />
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
            ? t('forms.loadError.expiredTitle')
            : isInvalid
              ? t('forms.loadError.notFoundTitle')
              : isRateLimited
                ? t('forms.loadError.rateLimitedTitle')
                : t('forms.loadError.unavailableTitle')}
        </h1>
        <p className="text-muted-foreground">
          {isExpired || isInvalid
            ? t('forms.loadError.inactiveBody')
            : isRateLimited
              ? t('forms.loadError.rateLimitedBody')
              : t('forms.loadError.unavailableBody')}
        </p>
        {!isExpired && !isInvalid && (
          <button
            type="button"
            className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? t('forms.tryingAgain') : t('forms.tryAgain')}
          </button>
        )}
      </div>
    );
  }

  if (data.status === 'submitted') {
    const submittedDate = data.submittedAt ? formatHumanDate(data.submittedAt, i18n.language) : '';
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('forms.alreadySubmittedTitle')}</h1>
        <p className="text-muted-foreground">
          {submittedDate
            ? t('forms.submittedOn', { date: submittedDate })
            : t('forms.alreadySubmittedBody')}
          {t('forms.contactForChanges')}
        </p>
      </div>
    );
  }

  if (data.status === 'expired') {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">{t('forms.loadError.expiredTitle')}</h1>
        <p className="text-muted-foreground">{t('forms.expiredPrivacyBody')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 border-b border-primary/15 pb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-primary">
          {t('forms.kicker')}
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
        submitIssues={
          submitMutation.error instanceof PublicFormSubmitError
            ? submitMutation.error.issues
            : undefined
        }
        isSuccess={submitMutation.isSuccess}
      />
    </div>
  );
}
