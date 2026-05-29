import { useId, useState } from 'react';
import type { FormDef, FormFieldDef, FormSectionIcon } from '@itatti/shared';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Landmark,
  LifeBuoy,
  MapPin,
  Send,
  User,
  Users,
} from 'lucide-react';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { cn } from '@/lib/utils';

interface PublicFormRendererProps {
  formDef: FormDef;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitError?: string;
  isSuccess: boolean;
}

export function PublicFormRenderer({
  formDef,
  onSubmit,
  isSubmitting,
  submitError,
  isSuccess,
}: PublicFormRendererProps) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border bg-card px-6 py-12 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-semibold tracking-tight">Thank you!</h2>
        <p className="text-muted-foreground">
          Your form has been submitted successfully. The I Tatti office will review your information. You may now close this window.
        </p>
      </div>
    );
  }

  function handleChange(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function isFieldVisible(field: FormFieldDef): boolean {
    if (!field.conditionalOn) return true;
    return values[field.conditionalOn.field] === field.conditionalOn.value;
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const section of formDef.sections) {
      for (const field of section.fields) {
        if (!isFieldVisible(field)) continue;
        if (field.required) {
          const v = values[field.name];
          if (v === undefined || v === '' || v === false) {
            newErrors[field.name] = 'This field is required';
          }
        }
        if (field.type === 'email' && values[field.name]) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(values[field.name]))) {
            newErrors[field.name] = 'Please enter a valid email address';
          }
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      {formDef.sections.map((section, si) => (
        <section
          key={si}
          className="overflow-hidden rounded-lg border bg-card shadow-sm"
          aria-labelledby={`form-section-${si}`}
        >
          <div className="flex items-start gap-3 border-b bg-secondary/55 px-5 py-4 sm:px-6">
            <SectionIcon icon={section.icon} />
            <div>
              <h2 id={`form-section-${si}`} className="text-lg font-semibold tracking-tight">
                {section.title}
              </h2>
              {section.description && (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {section.description}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-5 p-5 sm:grid-cols-12 sm:p-6">
            {section.fields.filter(isFieldVisible).map((field) => (
              <FieldRenderer
                key={field.name}
                field={field}
                value={values[field.name]}
                error={errors[field.name]}
                onChange={(v) => handleChange(field.name, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {submitError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{submitError}</div>
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? 'Submitting...' : 'Submit form'}
        </button>
      </div>
    </form>
  );
}

function SectionIcon({ icon }: { icon?: FormSectionIcon }) {
  const Icon =
    icon === 'user'
      ? User
      : icon === 'map-pin'
        ? MapPin
        : icon === 'users'
          ? Users
          : icon === 'life-buoy'
            ? LifeBuoy
            : icon === 'landmark'
              ? Landmark
              : ClipboardList;

  return (
    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-primary/15 bg-card text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
  );
}

function fieldLayoutClass(field: FormFieldDef): string {
  const layout =
    field.layout ??
    (field.type === 'textarea' || field.type === 'radio' || field.type === 'checkbox'
      ? 'full'
      : 'half');

  switch (layout) {
    case 'third':
      return 'sm:col-span-4';
    case 'half':
      return 'sm:col-span-6';
    case 'two-thirds':
      return 'sm:col-span-8';
    case 'full':
    default:
      return 'sm:col-span-12';
  }
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: FormFieldDef;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean) => void;
}) {
  const reactId = useId();
  const fieldId = `${reactId}-${field.name}`;
  const labelId = `${fieldId}-label`;
  const helpId = field.helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const baseInputClass =
    'w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-[0.95rem] ring-offset-background transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';
  const labelClass = 'mb-1.5 block text-sm font-semibold text-foreground';
  const showSearchableSelect = field.type === 'select' && (field.options?.length ?? 0) > 20;

  return (
    <div className={cn(fieldLayoutClass(field), 'min-w-0')}>
      {field.type === 'radio' ? (
        <fieldset aria-describedby={describedBy} aria-invalid={!!error}>
          <legend id={labelId} className={labelClass}>
            {field.label}
            {field.required && <RequiredMark />}
          </legend>
          {field.helpText && (
            <p id={helpId} className="mb-2 text-sm leading-5 text-muted-foreground">
              {field.helpText}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {field.options?.map((opt) => (
              <label
                key={opt}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors',
                  value === opt ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent/60'
                )}
              >
                <input
                  type="radio"
                  name={field.name}
                  value={opt}
                  checked={value === opt}
                  required={field.required}
                  onChange={() => onChange(opt)}
                  className="h-4 w-4 accent-primary"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {error && (
            <p id={errorId} className="mt-1.5 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </fieldset>
      ) : field.type === 'checkbox' ? (
        <div>
          <label
            htmlFor={fieldId}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/60"
          >
            <input
              id={fieldId}
              type="checkbox"
              checked={!!value}
              required={field.required}
              onChange={(e) => onChange(e.target.checked)}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span>
              {field.placeholder || field.label}
              {field.required && <RequiredMark />}
            </span>
          </label>
          {field.helpText && (
            <p id={helpId} className="mt-1.5 text-sm leading-5 text-muted-foreground">
              {field.helpText}
            </p>
          )}
          {error && (
            <p id={errorId} className="mt-1.5 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <label id={labelId} htmlFor={fieldId} className={labelClass}>
            {field.label}
            {field.required && <RequiredMark />}
          </label>

          {field.helpText && (
            <p id={helpId} className="mb-1.5 text-sm leading-5 text-muted-foreground">
              {field.helpText}
            </p>
          )}

          {field.type === 'textarea' ? (
            <textarea
              id={fieldId}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              autoComplete={field.autoComplete}
              required={field.required}
              rows={4}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              className={cn(baseInputClass, 'min-h-32 resize-y')}
            />
          ) : showSearchableSelect ? (
            <SearchableCombobox
              options={field.options?.map((opt) => ({ value: opt, label: opt })) ?? []}
              value={(value as string) || ''}
              displayValue={(value as string) || undefined}
              onSelect={(_, label) => onChange(label)}
              onClear={() => onChange('')}
              placeholder={field.placeholder || 'Select...'}
              emptyMessage="No matching options."
              ariaLabelledBy={labelId}
              ariaDescribedBy={describedBy}
              ariaInvalid={!!error}
              ariaRequired={field.required}
              className={
                error
                  ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                  : undefined
              }
            />
          ) : field.type === 'select' ? (
            <select
              id={fieldId}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              autoComplete={field.autoComplete}
              required={field.required}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              className={cn(
                baseInputClass,
                error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
              )}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={fieldId}
              type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              autoComplete={field.autoComplete}
              required={field.required}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              className={cn(
                baseInputClass,
                error && 'border-destructive focus:border-destructive focus:ring-destructive/20'
              )}
            />
          )}

          {error && (
            <p id={errorId} className="mt-1.5 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="ml-1 text-destructive" aria-hidden="true">
      *
    </span>
  );
}
