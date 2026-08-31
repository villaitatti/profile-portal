import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { accessSections } from '@/config/access';
import { navSections } from '@/config/navigation';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole } from '@itatti/shared';
import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';

function formatAudience(t: TFunction, requiredRoles?: readonly string[]): string {
  if (!requiredRoles || requiredRoles.length === 0) return t('admin.permissions.anyAuthenticatedUser');
  if (requiredRoles.length === 1) return t('admin.permissions.roleOnly', { role: requiredRoles[0] });
  return requiredRoles.join(t('admin.permissions.roleJoin'));
}

export function AccessPermissionsPage() {
  const { t } = useTranslation();
  const userRoles = useUserRoles();

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        title={t('admin.permissions.title')}
        description={t('admin.permissions.description')}
      />

      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary">
              <LockKeyhole className="h-4 w-4" />
              {t('admin.permissions.readOnly')}
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
              {t('admin.permissions.authHeading')}
            </h2>
            <p className="mt-2 text-[0.98rem] leading-7 text-muted-foreground">
              {t('admin.permissions.authBody')}
            </p>
          </div>
          <div className="min-w-64 rounded-lg border bg-secondary/35 p-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('admin.permissions.yourCurrentRoles')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {userRoles.length > 0 ? (
                userRoles.map((role) => <RoleBadge key={role} role={role} />)
              ) : (
                <span className="text-sm text-muted-foreground">{t('admin.permissions.noRoleClaims')}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t('admin.permissions.menuVisibility')}
          </h2>
          <p className="mt-1 text-[0.98rem] leading-7 text-muted-foreground">
            {t('admin.permissions.menuVisibilityDescription')}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead className="border-b bg-muted/45">
                <tr>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('admin.permissions.colSection')}
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('admin.permissions.colVisibleTo')}
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('admin.permissions.colMenuEntries')}
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('admin.permissions.colYourAccess')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {navSections.map((section, index) => {
                  const hasAccess =
                    !section.requiredRoles || hasAnyRole(userRoles, section.requiredRoles);
                  return (
                    <tr key={section.headingKey ?? 'base'} className="align-top">
                      <td className="px-4 py-4 font-semibold text-foreground">
                        {section.headingKey ? t(section.headingKey) : t('admin.permissions.baseNavigation')}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatAudience(t, section.requiredRoles)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {section.items.map((item) => (
                            <span
                              key={item.path}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[0.78rem] font-medium text-secondary-foreground"
                            >
                              {t(item.labelKey)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <AccessBadge allowed={hasAccess} index={index} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t('admin.permissions.apiAccess')}
          </h2>
          <p className="mt-1 text-[0.98rem] leading-7 text-muted-foreground">
            {t('admin.permissions.apiAccessDescription')}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Titles and audiences translate via the section's stable i18n keys;
              API route paths stay technical and untranslated. */}
          {accessSections.map((section) => (
            <article key={section.key} className="rounded-xl border bg-card p-5">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {t(section.labelKey)}
              </h3>
              <p className="mt-1 text-sm font-medium text-primary">
                {t(section.visibleToKey)}
              </p>
              <ul className="mt-4 space-y-2">
                {section.apiAccess.map((entry) => (
                  <li
                    key={entry}
                    className="rounded-md bg-muted/45 px-3 py-2 font-mono text-[0.78rem] text-muted-foreground"
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[0.78rem] font-semibold text-primary">
      {role}
    </span>
  );
}

function AccessBadge({ allowed, index }: { allowed: boolean; index: number }) {
  const { t } = useTranslation();

  if (allowed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[0.78rem] font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('admin.permissions.visible')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.78rem] font-semibold text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5" />
      {t('admin.permissions.hidden')}
      <span className="sr-only">{t('admin.permissions.hiddenFromSection', { number: index + 1 })}</span>
    </span>
  );
}
