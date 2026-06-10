import { useId, useState } from 'react';
import type { FormDef, FormFieldDef, FormSectionIcon } from '@itatti/shared';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Landmark,
  LifeBuoy,
  MapPin,
  Plus,
  Send,
  Trash2,
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

type RepeatableItem = Record<string, string | boolean>;
type FormValue = string | boolean | RepeatableItem[];

export function PublicFormRenderer({
  formDef,
  onSubmit,
  isSubmitting,
  submitError,
  isSuccess,
}: PublicFormRendererProps) {
  const [values, setValues] = useState<Record<string, FormValue>>({});
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

  function handleChange(name: string, value: FormValue) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${name}.`)) delete next[key];
      }
      return next;
    });
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
        if (field.type === 'subheader') continue;
        if (field.type === 'repeatable-group') {
          const items = values[field.name];
          const rows = Array.isArray(items) ? items : [];
          if (field.required && rows.length === 0) {
            newErrors[field.name] = 'This field is required';
          }
          rows.forEach((row, rowIndex) => {
            for (const childField of field.fields ?? []) {
              if (childField.type === 'subheader') continue;
              if (!childField.required) continue;
              const childValue = row[childField.name];
              if (childValue === undefined || childValue === '' || childValue === false) {
                newErrors[`${field.name}.${rowIndex}.${childField.name}`] =
                  'This field is required';
              }
            }
          });
          continue;
        }
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
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {formDef.sections.map((section, si) => (
        <section
          key={si}
          className="overflow-hidden rounded-lg border bg-card shadow-sm"
          aria-labelledby={`form-section-${si}`}
        >
          <div className="flex items-start gap-3 border-b bg-secondary/55 px-5 py-5 sm:px-7">
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

          <div className="grid grid-cols-1 gap-x-6 gap-y-7 p-5 sm:grid-cols-12 sm:p-7">
            {section.fields.filter(isFieldVisible).map((field) => (
              <FieldRenderer
                key={field.name}
                field={field}
                value={values[field.name]}
                error={errors[field.name]}
                errors={errors}
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
    (field.type === 'textarea' ||
      field.type === 'radio' ||
      field.type === 'checkbox' ||
      field.type === 'subheader' ||
      field.type === 'repeatable-group'
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
  errors,
  onChange,
}: {
  field: FormFieldDef;
  value: FormValue | undefined;
  error?: string;
  errors: Record<string, string>;
  onChange: (value: FormValue) => void;
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

  if (field.type === 'subheader') {
    return (
      <div className={cn(fieldLayoutClass(field), 'min-w-0 pt-1')}>
        <h3 className="border-b border-border/70 pb-2 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
          {field.label}
        </h3>
      </div>
    );
  }

  if (field.type === 'repeatable-group') {
    return (
      <RepeatableGroupRenderer
        field={field}
        value={Array.isArray(value) ? value : []}
        error={error}
        errors={errors}
        onChange={onChange}
      />
    );
  }

  return (
    <div
      className={cn(
        fieldLayoutClass(field),
        'min-w-0',
        field.conditionalOn &&
          'rounded-md border-l-2 border-primary/35 bg-primary/[0.03] py-2 pl-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200'
      )}
    >
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

function RepeatableGroupRenderer({
  field,
  value,
  error,
  errors,
  onChange,
}: {
  field: FormFieldDef;
  value: RepeatableItem[];
  error?: string;
  errors: Record<string, string>;
  onChange: (value: FormValue) => void;
}) {
  const reactId = useId();
  const groupId = `${reactId}-${field.name}`;
  const childFields = field.fields ?? [];
  const baseInputClass =
    'w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-[0.95rem] ring-offset-background transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';
  const labelClass = 'mb-1.5 block text-sm font-semibold text-foreground';

  function emptyItem(): RepeatableItem {
    return Object.fromEntries(
      childFields
        .filter((childField) => childField.type !== 'subheader')
        .map((childField) => [childField.name, ''])
    );
  }

  function updateItem(index: number, childName: string, childValue: string | boolean) {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [childName]: childValue } : item
      )
    );
  }

  return (
    <div className={cn(fieldLayoutClass(field), 'min-w-0')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id={groupId} className={labelClass}>
            {field.label}
            {field.required && <RequiredMark />}
          </h4>
          {field.helpText && (
            <p className="text-sm leading-5 text-muted-foreground">{field.helpText}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange([...value, emptyItem()])}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {field.addLabel ?? 'Add entry'}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No children added.</p>
      ) : (
        <div className="mt-4 space-y-5" aria-labelledby={groupId}>
          {value.map((item, index) => (
            <div
              key={index}
              className="border-l-2 border-primary/25 pl-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">
                  {field.itemLabel ?? 'Entry'} {index + 1}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Remove ${(field.itemLabel ?? 'entry').toLowerCase()} ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-12">
                {childFields
                  .filter((childField) => childField.type !== 'subheader')
                  .map((childField) => {
                    const childId = `${groupId}-${index}-${childField.name}`;
                    const childError = errors[`${field.name}.${index}.${childField.name}`];
                    const childHelpId = childField.helpText ? `${childId}-help` : undefined;
                    const childErrorId = childError ? `${childId}-error` : undefined;
                    const describedBy = [childHelpId, childErrorId].filter(Boolean).join(' ') || undefined;

                    return (
                      <div key={childField.name} className={cn(fieldLayoutClass(childField), 'min-w-0')}>
                        <label htmlFor={childId} className={labelClass}>
                          {childField.label}
                          {childField.required && <RequiredMark />}
                        </label>
                        {childField.helpText && (
                          <p id={childHelpId} className="mb-1.5 text-sm leading-5 text-muted-foreground">
                            {childField.helpText}
                          </p>
                        )}
                        {childField.type === 'textarea' ? (
                          <textarea
                            id={childId}
                            value={String(item[childField.name] ?? '')}
                            onChange={(e) => updateItem(index, childField.name, e.target.value)}
                            placeholder={childField.placeholder}
                            maxLength={childField.maxLength}
                            required={childField.required}
                            rows={3}
                            aria-describedby={describedBy}
                            aria-invalid={!!childError}
                            className={cn(
                              baseInputClass,
                              'min-h-28 resize-y',
                              childError &&
                                'border-destructive focus:border-destructive focus:ring-destructive/20'
                            )}
                          />
                        ) : childField.type === 'select' ? (
                          <select
                            id={childId}
                            value={String(item[childField.name] ?? '')}
                            onChange={(e) => updateItem(index, childField.name, e.target.value)}
                            required={childField.required}
                            aria-describedby={describedBy}
                            aria-invalid={!!childError}
                            className={cn(
                              baseInputClass,
                              childError &&
                                'border-destructive focus:border-destructive focus:ring-destructive/20'
                            )}
                          >
                            <option value="">{childField.placeholder || 'Select...'}</option>
                            {childField.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={childId}
                            type={
                              childField.type === 'email'
                                ? 'email'
                                : childField.type === 'date'
                                  ? 'date'
                                  : 'text'
                            }
                            value={String(item[childField.name] ?? '')}
                            onChange={(e) => updateItem(index, childField.name, e.target.value)}
                            placeholder={childField.placeholder}
                            maxLength={childField.maxLength}
                            autoComplete={childField.autoComplete}
                            required={childField.required}
                            aria-describedby={describedBy}
                            aria-invalid={!!childError}
                            className={cn(
                              baseInputClass,
                              childError &&
                                'border-destructive focus:border-destructive focus:ring-destructive/20'
                            )}
                          />
                        )}
                        {childError && (
                          <p id={childErrorId} className="mt-1.5 text-xs font-medium text-destructive">
                            {childError}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
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
