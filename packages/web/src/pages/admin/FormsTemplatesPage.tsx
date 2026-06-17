import { useMemo, useState } from 'react';
import { useFormRegistry } from '@/api/forms';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormsSectionNav } from '@/pages/admin/components/FormsSectionNav';
import { cn } from '@/lib/utils';
import { isActiveFormDef } from '@itatti/shared';
import { FileText } from 'lucide-react';
import type { FormDef, FormFieldDef, FormSectionDef } from '@itatti/shared';

type TemplateTab = 'active' | 'retired';

export function FormsTemplatesPage() {
  const { data: registry, isLoading } = useFormRegistry();
  const [tab, setTab] = useState<TemplateTab>('active');

  // The registry appends each new form definition at the end (within a given
  // form family, that means oldest → newest: v1, v2, v3). Reversing surfaces the
  // newest version of a family first — what staff care about — which is the
  // ordering that matters on the Retired tab (e.g. fellow-memorandum-v2 above
  // -v1). Cross-family order on the Active tab is incidental: each family
  // contributes only its single current form, so there is no older/newer among
  // them to honor. Not a global version sort — just newest-appended-first.
  const { active, retired } = useMemo(() => {
    const ordered = [...(registry ?? [])].reverse();
    return {
      active: ordered.filter(isActiveFormDef),
      retired: ordered.filter((form) => !isActiveFormDef(form)),
    };
  }, [registry]);

  const forms = tab === 'active' ? active : retired;

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Review submitted appointee forms and inspect the templates used during nomination."
      />
      <FormsSectionNav />

      <div className="mt-6 space-y-6">
        <TemplateTabs
          tab={tab}
          onTabChange={setTab}
          activeCount={active.length}
          retiredCount={retired.length}
        />

        {isLoading ? (
          <LoadingSpinner />
        ) : forms.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12 mb-4" />}
            title={tab === 'active' ? 'No active templates' : 'No retired templates'}
            description={
              tab === 'active'
                ? 'Active form templates will appear here once configured.'
                : 'Retired templates are kept for archived submissions. None yet.'
            }
          />
        ) : (
          <div className="space-y-6">
            {forms.map((form) => (
              <FormCard key={form.id} form={form} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateTabs({
  tab,
  onTabChange,
  activeCount,
  retiredCount,
}: {
  tab: TemplateTab;
  onTabChange: (tab: TemplateTab) => void;
  activeCount: number;
  retiredCount: number;
}) {
  const tabs: { value: TemplateTab; label: string; count: number }[] = [
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'retired', label: 'Retired', count: retiredCount },
  ];

  return (
    <nav className="border-b border-border" aria-label="Template status">
      <div className="flex gap-1">
        {tabs.map(({ value, label, count }) => {
          const isActive = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              aria-pressed={isActive}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                isActive &&
                  'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
              )}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function FormCard({ form }: { form: FormDef }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{form.title}</h3>
          {/* Several form versions share an identical title (e.g. fellow-memorandum
              v1/v2/v3 are all "Memorandum I Tatti Fellowship"). Surface the
              registry id so staff can tell otherwise-identical cards apart. */}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{form.id}</p>
          {!isActiveFormDef(form) && (
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Retired template kept for archived submissions
            </p>
          )}
          {form.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{form.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isActiveFormDef(form)
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isActiveFormDef(form) ? 'Active' : 'Retired'}
          </span>
          {form.appointmentTypes.map((type) => (
            <span
              key={type}
              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {type}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {form.sections.map((section, i) => {
          const guidanceFields = fieldsWithGuidance(section);
          return (
            <div key={i} className="border-t pt-3 first:border-t-0 first:pt-0">
              <h4 className="text-sm font-medium mb-2">{section.title}</h4>
              {section.description && (
                <p className="mb-3 max-w-3xl whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                  {section.description}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {section.fields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    <span>{field.label}</span>
                    {field.required && <span className="text-destructive">*</span>}
                    <span className="ml-auto text-[10px] opacity-60">{field.type}</span>
                  </div>
                ))}
              </div>

              {guidanceFields.length > 0 && (
                <dl className="mt-3 space-y-3 rounded-md border border-border/60 bg-muted/40 p-3">
                  {guidanceFields.map((field, fieldIndex) => (
                    // fieldsWithGuidance flattens repeatable-group children, so
                    // two entries can share a name (a child reusing a top-level
                    // name, or children across groups). Index-qualify the key so
                    // reconciliation stays stable.
                    <div key={`${field.name}-${fieldIndex}`}>
                      <dt className="text-xs font-medium text-foreground">{field.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                        {field.helpText}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
        {form.sections.reduce((acc, s) => acc + s.fields.length, 0)} fields across{' '}
        {form.sections.length} sections
      </div>
    </div>
  );
}

/**
 * Collect the fields in a section that carry explanatory `helpText` — the
 * guidance fellows read on the live form (e.g. the Grant Information
 * "Resources" and "Additional information" instructions). Flattens
 * repeatable-group children so nested guidance is not hidden. Lets admin
 * staff read the instructional copy straight from the template card without
 * opening a form.
 */
function fieldsWithGuidance(section: FormSectionDef): FormFieldDef[] {
  const out: FormFieldDef[] = [];
  for (const field of section.fields) {
    if (field.helpText) out.push(field);
    for (const child of field.fields ?? []) {
      if (child.helpText) out.push(child);
    }
  }
  return out;
}
