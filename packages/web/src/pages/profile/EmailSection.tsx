import { Mail, ExternalLink } from 'lucide-react';

interface EmailSectionProps {
  email?: string;
}

export function EmailSection({ email }: EmailSectionProps) {
  return (
    <div className="rounded-xl border bg-card p-6 md:px-8">
      <div className="flex items-center gap-3">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-tight">Email</h2>
      </div>

      <p className="mt-4 text-base text-foreground">{email || '—'}</p>

      <p className="mt-2 text-[0.88rem] leading-6 text-muted-foreground">
        This is the email I Tatti uses for all correspondence, mailing lists, and your VIT ID.
      </p>

      <a
        href="mailto:it-help@itatti.harvard.edu?subject=Email change request"
        className="mt-3 inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-primary hover:underline"
      >
        Need to change it? Contact IT staff
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
