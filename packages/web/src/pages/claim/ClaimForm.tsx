import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '@/api/client';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Schema messages are i18n keys, translated at the render site so the copy
// follows the active language.
const claimSchema = z.object({
  email: z.string().email('claim.errors.emailInvalid'),
});

type ClaimFormData = z.infer<typeof claimSchema>;

export function ClaimForm() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClaimFormData>({
    resolver: zodResolver(claimSchema),
  });

  const onSubmit = async (data: ClaimFormData) => {
    setSubmitting(true);
    setUnreachable(false);
    try {
      await apiFetch('/api/claim', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setSubmitted(true);
    } catch (err) {
      // Any *response* from the server — 404, 409, 429, 500 — is masked behind
      // the generic confirmation: telling them apart would let a caller
      // enumerate which addresses are eligible. A fetch TypeError is different:
      // the request never left the browser, so nothing about the address leaks
      // and claiming "submitted" would be a lie.
      if (err instanceof TypeError) {
        setUnreachable(true);
      } else {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('claim.form.submittedTitle')}</h3>
        <p className="text-muted-foreground">{t('claim.form.submittedBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="rounded-xl border bg-card p-8">
      <h2 className="text-xl font-semibold mb-2">{t('claim.form.title')}</h2>
      <p className="text-muted-foreground mb-6 text-sm">{t('claim.form.description')}</p>

      {unreachable && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{t('claim.form.unreachable')}</span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-1.5"
          >
            {t('claim.form.emailLabel')}
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            placeholder={t('claim.form.emailPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.email?.message && (
            <p className="text-sm text-destructive mt-1">
              {t(errors.email.message)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('claim.form.processing')}
            </>
          ) : (
            t('claim.form.submit')
          )}
        </button>
      </div>
    </form>
  );
}
