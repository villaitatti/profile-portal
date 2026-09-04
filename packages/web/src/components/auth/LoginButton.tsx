import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function LoginButton() {
  const { t } = useTranslation();
  const { loginWithRedirect } = useAuth0();

  return (
    <Button size="lg" className="px-6" onClick={() => void loginWithRedirect()}>
      {t('auth.signIn')}
    </Button>
  );
}
