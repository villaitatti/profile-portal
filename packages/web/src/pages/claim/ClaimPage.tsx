import { useTranslation } from 'react-i18next';
import { ClaimForm } from './ClaimForm';
import { ClaimHelpForm } from './ClaimHelpForm';

export function ClaimPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h1 className="mb-2 font-heading text-[2.3rem] leading-tight">
          {t('claim.welcomeTitle')}
        </h1>
        <p className="text-[1.05rem] leading-7 text-muted-foreground max-w-lg mx-auto">
          {t('claim.welcomeIntro')}
        </p>
      </div>

      <ClaimForm />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">
            {t('claim.or')}
          </span>
        </div>
      </div>

      <ClaimHelpForm />
    </div>
  );
}
