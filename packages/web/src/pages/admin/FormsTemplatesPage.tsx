import { useFormRegistry } from '@/api/forms';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { FormsSectionNav } from '@/pages/admin/components/FormsSectionNav';
import type { FormDef } from '@itatti/shared';

export function FormsTemplatesPage() {
  const { data: registry, isLoading } = useFormRegistry();

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Review submitted appointee forms and inspect the templates used during nomination."
      />
      <FormsSectionNav />

      <div className="mt-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-6">
            {registry?.map((form) => (
              <FormCard key={form.id} form={form} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormCard({ form }: { form: FormDef }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{form.title}</h3>
          {form.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{form.description}</p>
          )}
        </div>
        <div className="flex gap-2">
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
        {form.sections.map((section, i) => (
          <div key={i} className="border-t pt-3 first:border-t-0 first:pt-0">
            <h4 className="text-sm font-medium mb-2">{section.title}</h4>
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
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
        {form.sections.reduce((acc, s) => acc + s.fields.length, 0)} fields across{' '}
        {form.sections.length} sections
      </div>
    </div>
  );
}
