import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '@/api/client';
import { Loader2, CheckCircle2 } from 'lucide-react';

const helpSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  contactEmail: z.string().email('Please enter a valid email address'),
  fellowshipYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY (e.g., 2024-2025)'),
  message: z.string().max(2000).optional(),
});

type HelpFormData = z.infer<typeof helpSchema>;

export function ClaimHelpForm() {
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
        <h3 className="text-lg font-semibold mb-2">Request Submitted</h3>
        <p className="text-muted-foreground">
          Your request has been submitted. Our team will follow up at the email
          address provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-8">
      <h2 className="text-xl font-semibold mb-2">Need help?</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        If you cannot claim your VIT ID automatically, fill out this form and our
        team will assist you.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">
            Full name
          </label>
          <input
            {...register('fullName')}
            type="text"
            id="fullName"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive mt-1">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium mb-1.5">
            Contact email
          </label>
          <input
            {...register('contactEmail')}
            type="email"
            id="contactEmail"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.contactEmail && (
            <p className="text-sm text-destructive mt-1">{errors.contactEmail.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="fellowshipYear" className="block text-sm font-medium mb-1.5">
            Fellowship year
          </label>
          <input
            {...register('fellowshipYear')}
            type="text"
            id="fellowshipYear"
            placeholder="2024-2025"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.fellowshipYear && (
            <p className="text-sm text-destructive mt-1">{errors.fellowshipYear.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-1.5">
            Message <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            {...register('message')}
            id="message"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            disabled={submitting}
          />
          {errors.message && (
            <p className="text-sm text-destructive mt-1">{errors.message.message}</p>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-destructive">
            Something went wrong. Please try again, or contact IT directly at{' '}
            <a href="mailto:itatti_it@harvard.edu" className="underline hover:no-underline">
              itatti_it@harvard.edu
            </a>.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Help Request'
          )}
        </button>
      </div>
    </form>
  );
}
