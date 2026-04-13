import { ClaimForm } from './ClaimForm';
import { ClaimHelpForm } from './ClaimHelpForm';

export function ClaimPage() {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Welcome to I Tatti
        </h1>
        <p className="text-[1.05rem] leading-7 text-muted-foreground max-w-lg mx-auto">
          Your VIT ID is your personal credential for I Tatti's digital services&nbsp;—
          email, cloud storage, internal tools, and more. Current fellows, visiting
          scholars, and appointees are eligible.
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
