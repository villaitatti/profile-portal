import { PageHeader } from '@/components/shared/PageHeader';
import { navSections, apiAccessRules } from '@/config/navigation';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole } from '@itatti/shared';
import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';

function formatAudience(requiredRoles?: string[]): string {
  if (!requiredRoles || requiredRoles.length === 0) return 'Any authenticated user';
  if (requiredRoles.length === 1) return `${requiredRoles[0]} only`;
  return requiredRoles.join(' or ');
}

export function AccessPermissionsPage() {
  const userRoles = useUserRoles();

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        title="Access & Permissions"
        description="Read-only reference for who can see each portal section and which API areas enforce the same role boundaries."
      />

      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary">
              <LockKeyhole className="h-4 w-4" />
              Read-only
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
              Auth0 controls login; Auth0 roles control portal permissions
            </h2>
            <p className="mt-2 text-[0.98rem] leading-7 text-muted-foreground">
              Users need a valid token from the configured Auth0 tenant and API audience to
              call protected endpoints. Role claims in that token decide which admin
              sections and admin APIs they can use.
            </p>
          </div>
          <div className="min-w-64 rounded-lg border bg-secondary/35 p-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Your current roles
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {userRoles.length > 0 ? (
                userRoles.map((role) => <RoleBadge key={role} role={role} />)
              ) : (
                <span className="text-sm text-muted-foreground">No role claims in this session</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Menu Visibility</h2>
          <p className="mt-1 text-[0.98rem] leading-7 text-muted-foreground">
            The sidebar reads this same navigation registry, so this table follows the
            menu users actually see.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead className="border-b bg-muted/45">
                <tr>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Section
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Visible To
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Menu Entries
                  </th>
                  <th className="px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Your Access
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {navSections.map((section, index) => {
                  const hasAccess =
                    !section.requiredRoles || hasAnyRole(userRoles, section.requiredRoles);
                  return (
                    <tr key={section.heading ?? 'base'} className="align-top">
                      <td className="px-4 py-4 font-semibold text-foreground">
                        {section.heading ?? 'Base Navigation'}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatAudience(section.requiredRoles)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {section.items.map((item) => (
                            <span
                              key={item.path}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[0.78rem] font-medium text-secondary-foreground"
                            >
                              {item.label}
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
          <h2 className="text-xl font-semibold tracking-tight text-foreground">API Access</h2>
          <p className="mt-1 text-[0.98rem] leading-7 text-muted-foreground">
            Backend route groups enforce these permissions after JWT verification.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {apiAccessRules.map((rule) => (
            <article key={rule.label} className="rounded-xl border bg-card p-5">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">{rule.label}</h3>
              <p className="mt-1 text-sm font-medium text-primary">{rule.visibleTo}</p>
              <ul className="mt-4 space-y-2">
                {rule.access.map((entry) => (
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
  if (allowed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[0.78rem] font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Visible
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.78rem] font-semibold text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5" />
      Hidden
      <span className="sr-only">from section {index + 1}</span>
    </span>
  );
}
