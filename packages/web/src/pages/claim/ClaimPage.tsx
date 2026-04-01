import { ClaimForm } from './ClaimForm';
import { ClaimHelpForm } from './ClaimHelpForm';

export function ClaimPage() {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          VIT ID — Self Service
        </h1>
        <p className="text-muted-foreground">
          Your VIT ID gives you access to I Tatti web applications.
        </p>
      </div>

      <ClaimForm />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            or
          </span>
        </div>
      </div>

      <ClaimHelpForm />
    </div>
  );
}
