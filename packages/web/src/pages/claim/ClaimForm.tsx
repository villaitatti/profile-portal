import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '@/api/client';
import { Loader2, CheckCircle2 } from 'lucide-react';

const claimSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ClaimFormData = z.infer<typeof claimSchema>;

export function ClaimForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClaimFormData>({
    resolver: zodResolver(claimSchema),
  });

  const onSubmit = async (data: ClaimFormData) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/claim', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      // Always show success — anti-enumeration
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Request Submitted</h3>
        <p className="text-muted-foreground">
          If you are eligible, you will receive an email with next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-8">
      <h2 className="text-xl font-semibold mb-2">Claim your VIT ID</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        Enter your email address to check your eligibility and receive your VIT ID credentials.
      </p>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-1.5"
          >
            Email address
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={submitting}
          />
          {errors.email && (
            <p className="text-sm text-destructive mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Claim VIT ID'
          )}
        </button>
      </div>
    </form>
  );
}
