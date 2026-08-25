import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { LoginMethod } from '@itatti/shared';
import itattiMarchio from '@/assets/itatti-marchio.png';
import harvardShield from '@/assets/harvard-shield.svg';
import { Globe } from 'lucide-react';

interface LoginMethodBadgeProps {
  method: LoginMethod;
  className?: string;
}

export function LoginMethodBadge({ method, className }: LoginMethodBadgeProps) {
  const { t } = useTranslation();
  switch (method) {
    case 'vit-id':
      return (
        <span className={cn('inline-flex items-center rounded-full bg-[#ab192d]/10 px-2.5 py-1 text-[0.8rem] font-medium text-[#ab192d]', className)}>
          <img src={itattiMarchio} alt="" className="mr-1.5 h-3.5 w-3.5 object-contain" aria-hidden="true" />
          {t('fellows.badges.login.vitId')}
        </span>
      );
    case 'harvard-key':
      return (
        <span className={cn('inline-flex items-center rounded-full bg-[#A51C30]/10 px-2.5 py-1 text-[0.8rem] font-medium text-[#A51C30]', className)}>
          <img src={harvardShield} alt="" className="mr-1.5 h-3.5 w-3.5 object-contain" aria-hidden="true" />
          {t('fellows.badges.login.harvardKey')}
        </span>
      );
    case 'none':
      return (
        <span className={cn('inline-flex items-center rounded-full bg-sky-200 px-2.5 py-1 text-[0.8rem] font-medium text-sky-700', className)}>
          <Globe className="mr-1.5 h-3 w-3 text-sky-600" aria-hidden="true" />
          {t('fellows.badges.login.public')}
        </span>
      );
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}
