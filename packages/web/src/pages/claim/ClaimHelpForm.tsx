import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '@/api/client';
import { Loader2, CheckCircle2 } from 'lucide-react';

// Schema messages are i18n keys, translated at the render site so the copy
// follows the active language.
const helpSchema = z.object({
  fullName: z.string().min(2, 'claim.errors.nameRequired'),
  contactEmail: z.string().email('claim.errors.emailInvalid'),
  fellowshipYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'claim.errors.fellowshipYearFormat'),
  message: z.string().max(2000, 'claim.errors.messageTooLong').optional(),
});

type HelpFormData = z.infer<typeof helpSchema>;

export function ClaimHelpForm() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HelpFormData>({
    resolver: zodResolver(helpSchema),
  });

  const onSubmit = async (data: HelpFormData) => {
    setSubmitting(true);
    setSubmitError(false);
    try {
      await apiFetch('/api/help', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setSubmitted(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('claim.help.submittedTitle')}</h3>
        <p className="text-muted-foreground">{t('claim.help.submittedBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-8">
      <h2 className="text-xl font-semibold mb-2">{t('claim.help.title')}</h2>
      <p className="text-muted-foreground mb-6 text-sm">{t('claim.help.description')}</p>

      <div className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">
            {t('claim.help.fullNameLabel')}
          </label>
          <input
            {...register('fullName')}
            type="text"
            id="fullName"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.fullName?.message && (
            <p className="text-sm text-destructive mt-1">{t(errors.fullName.message)}</p>
          )}
        </div>

        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium mb-1.5">
            {t('claim.help.contactEmailLabel')}
          </label>
          <input
            {...register('contactEmail')}
            type="email"
            id="contactEmail"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.contactEmail?.message && (
            <p className="text-sm text-destructive mt-1">{t(errors.contactEmail.message)}</p>
          )}
        </div>

        <div>
          <label htmlFor="fellowshipYear" className="block text-sm font-medium mb-1.5">
            {t('claim.help.fellowshipYearLabel')}
          </label>
          <input
            {...register('fellowshipYear')}
            type="text"
            id="fellowshipYear"
            placeholder="2024-2025"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.fellowshipYear?.message && (
            <p className="text-sm text-destructive mt-1">{t(errors.fellowshipYear.message)}</p>
          )}
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-1.5">
            {t('claim.help.messageLabel')}{' '}
            <span className="text-muted-foreground">{t('claim.help.optional')}</span>
          </label>
          <textarea
            {...register('message')}
            id="message"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            disabled={submitting}
          />
          {errors.message?.message && (
            <p className="text-sm text-destructive mt-1">{t(errors.message.message)}</p>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-destructive">
            {t('claim.help.errorPrefix')}{' '}
            <a href="mailto:itatti_it@harvard.edu" className="underline hover:no-underline">
              itatti_it@harvard.edu
            </a>.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('claim.help.submitting')}
            </>
          ) : (
            t('claim.help.submit')
          )}
        </button>
      </div>
    </form>
  );
}
