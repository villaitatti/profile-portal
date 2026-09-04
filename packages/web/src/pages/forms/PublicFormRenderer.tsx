import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import type { BlockerFunction } from 'react-router';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { SelectDropdown } from '@/components/shared/SelectDropdown';
import { cn } from '@/lib/utils';
import type { PublicFormSubmitIssue } from '@/api/forms';

interface PublicFormRendererProps {
  formDef: FormDef;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitError?: string;
  /** Field-level detail from a server 400 — what makes an over-limit paste diagnosable. */
  submitIssues?: PublicFormSubmitIssue[];
  isSuccess: boolean;
}

type RepeatableItem = Record<string, string | boolean>;
type FormValue = string | boolean | RepeatableItem[];
const SEARCHABLE_SELECT_THRESHOLD = 20;

function todayInRome(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveDateBound(bound: FormFieldDef['maxDate']): string | undefined {
  return bound === 'today' ? todayInRome() : bound;
}

function dateConstraintError(field: FormFieldDef, value: unknown, t: TFunction): string | null {
  if (field.type !== 'date' || typeof value !== 'string' || value === '') return null;
  if (field.minDate && value < field.minDate) {
    return t('forms.validation.dateMin', { date: field.minDate });
  }
  const maximum = resolveDateBound(field.maxDate);
  if (maximum && value > maximum) {
    return field.maxDate === 'today'
      ? t('forms.validation.dateFuture')
      : t('forms.validation.dateMax', { date: maximum });
  }
  return null;
}

/**
 * Post-submit confirmation. Shared with PublicFormPage, which shows it even
 * when a later refetch of the (now rotated) token fails.
 */
export function FormSubmittedPanel() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-lg border bg-card px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-9 w-9 text-primary" />
      </div>
      <h2 className="mb-2 font-heading text-[1.8rem] leading-tight">{t('forms.thankYouTitle')}</h2>
      <p className="text-muted-foreground">{t('forms.thankYouBody')}</p>
    </div>
  );
}

export function PublicFormRenderer({
  formDef,
  onSubmit,
  isSubmitting,
  submitError,
  submitIssues,
  isSuccess,
}: PublicFormRendererProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [failedSubmitCount, setFailedSubmitCount] = useState(0);

  // Whether the appointee has typed anything not yet accepted by the server.
  // Adding a repeatable-group row counts: it is a deliberate act worth keeping.
  const hasUnsavedInput =
    !isSuccess &&
    Object.values(values).some((value) =>
      Array.isArray(value) ? value.length > 0 : value !== '' && value !== false
    );

  // There is no draft persistence, so while there is unsaved input a close,
  // reload, or navigation away must ask for confirmation. The guard drops off
  // on success so the confirmation screen doesn't trap the appointee.
  useEffect(() => {
    if (!hasUnsavedInput) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome still requires returnValue to be set for the prompt to show.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedInput]);

  // beforeunload only covers closing/reloading the tab. Client-side router
  // transitions (links, back/forward) unmount this component without any
  // browser prompt, so they get their own guard under the same condition.
  // Language toggling is not a navigation and never trips it. Called
  // unconditionally (hooks rules); the shouldBlock function keeps it inert
  // while there is nothing to lose.
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        hasUnsavedInput && currentLocation.pathname !== nextLocation.pathname,
      [hasUnsavedInput]
    )
  );

  // After a failed validation pass, move the appointee to the first problem:
  // on a long form every inline error may sit far above the submit button.
  useEffect(() => {
    if (failedSubmitCount === 0) return;
    const invalid = formRef.current?.querySelector('[aria-invalid="true"]');
    if (!(invalid instanceof HTMLElement)) return;
    // A radio group carries aria-invalid on its <fieldset>, which is not
    // focusable — descend to its first input.
    const target = invalid.matches('input, select, textarea, button')
      ? invalid
      : (invalid.querySelector<HTMLElement>('input, select, textarea, button') ?? invalid);
    target.focus();
    target.scrollIntoView({ block: 'center' });
  }, [failedSubmitCount]);

  if (isSuccess) {
    return <FormSubmittedPanel />;
  }

  /**
   * Names of fields whose `conditionalOn` gate is no longer satisfied. Applied
   * repeatedly so a chain of conditionals collapses in one pass.
   */
  function pruneHiddenValues(next: Record<string, FormValue>): string[] {
    const removed: string[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const section of formDef.sections) {
        for (const field of section.fields) {
          const gate = field.conditionalOn;
          if (!gate || !(field.name in next) || next[gate.field] === gate.value) continue;
          delete next[field.name];
          removed.push(field.name);
          changed = true;
        }
      }
    }
    return removed;
  }

  function handleChange(name: string, value: FormValue) {
    // A field that just became hidden must not keep submitting its old value
    // (e.g. a stale "Other status" text after switching away from Other).
    const next = { ...values, [name]: value };
    const hidden = pruneHiddenValues(next);
    setValues(next);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      for (const key of Object.keys(next)) {
        const owner = key.split('.')[0];
        if (owner === name || hidden.includes(owner)) delete next[key];
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
            newErrors[field.name] = t('forms.validation.required');
          }
          rows.forEach((row, rowIndex) => {
            for (const childField of field.fields ?? []) {
              if (childField.type === 'subheader') continue;
              const childValue = row[childField.name];
              const errorKey = `${field.name}.${rowIndex}.${childField.name}`;
              if (
                childField.required &&
                (childValue === undefined || childValue === '' || childValue === false)
              ) {
                newErrors[errorKey] = t('forms.validation.required');
                continue;
              }
              const dateError = dateConstraintError(childField, childValue, t);
              if (dateError) newErrors[errorKey] = dateError;
            }
          });
          continue;
        }
        if (field.required) {
          const v = values[field.name];
          if (v === undefined || v === '' || v === false) {
            newErrors[field.name] = t('forms.validation.required');
          }
        }
        if (field.type === 'email' && values[field.name]) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(values[field.name]))) {
            newErrors[field.name] = t('forms.validation.emailInvalid');
          }
        }
        const dateError = dateConstraintError(field, values[field.name], t);
        if (dateError) newErrors[field.name] = dateError;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      // Bump a counter rather than focusing here: the inline errors (and their
      // aria-invalid markers) only exist in the DOM after the next render.
      setFailedSubmitCount((count) => count + 1);
      return;
    }
    onSubmit(values);
  }

  const validationErrorCount = Object.keys(errors).length;

  return (
    <>
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-8" noValidate>
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
                <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
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
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p>{submitError}</p>
            {submitIssues && submitIssues.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {submitIssues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>
                    {issue.path ? `${fieldLabelForPath(formDef, issue.path)}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Summary next to the submit button: on a long form the inline errors
          can all sit above the fold, so the click must produce visible,
          announced feedback where it happened. Derived from `errors`, it
          disappears as the appointee fixes the highlighted fields. */}
      {validationErrorCount > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <p>{t('forms.validation.summary', { count: validationErrorCount })}</p>
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-5">
        <Button type="submit" size="lg" className="w-full px-5 sm:w-auto" disabled={isSubmitting}>
          <Send data-icon="inline-start" />
          {isSubmitting ? t('forms.submitting') : t('forms.submit')}
        </Button>
      </div>
    </form>

    {/* Shown when the blocker above intercepts a client-side navigation.
        "Stay" (cancel) resets the blocker; "Leave" proceeds and the input is
        deliberately discarded. */}
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
      title={t('forms.leaveGuard.title')}
      description={t('forms.leaveGuard.body')}
      confirmLabel={t('forms.leaveGuard.leave')}
      cancelLabel={t('forms.leaveGuard.stay')}
      variant="danger"
    />
    </>
  );
}

/**
 * Turns a server issue path (`bio`, `familyMembers.0.firstName`) into the
 * label the appointee actually saw. Falls back to the raw path when the field
 * is not in this form definition.
 */
function fieldLabelForPath(formDef: FormDef, path: string): string {
  const [head, ...rest] = path.split('.');
  for (const section of formDef.sections) {
    for (const field of section.fields) {
      if (field.name !== head) continue;
      const childName = rest[rest.length - 1];
      const child = field.fields?.find((f) => f.name === childName);
      if (child) return `${field.label} — ${child.label}`;
      return field.label;
    }
  }
  return path;
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
  const { t } = useTranslation();
  const reactId = useId();
  const fieldId = `${reactId}-${field.name}`;
  const labelId = `${fieldId}-label`;
  const helpId = field.helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const baseInputClass =
    'w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-[0.95rem] ring-offset-background transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';
  const labelClass = 'mb-1.5 block text-sm font-semibold text-foreground';
  const isSearchableSelect =
    field.type === 'select' && (field.options?.length ?? 0) > SEARCHABLE_SELECT_THRESHOLD;

  if (field.type === 'subheader') {
    return (
      <div className={cn(fieldLayoutClass(field), 'min-w-0 pt-1')}>
        <h3 className="border-b border-border/70 pb-2 text-[1rem] font-semibold text-foreground">
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
            <p id={helpId} className="mb-2 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
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
            <p id={helpId} className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
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
            <p id={helpId} className="mb-1.5 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
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
          ) : isSearchableSelect ? (
            <SearchableCombobox
              id={fieldId}
              options={field.options?.map((opt) => ({ value: opt, label: opt })) ?? []}
              value={(value as string) || ''}
              displayValue={(value as string) || undefined}
              onSelect={(_, label) => onChange(label)}
              onClear={() => onChange('')}
              placeholder={field.placeholder || t('forms.selectPlaceholder')}
              emptyMessage={t('forms.noMatchingOptions')}
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
            <SelectDropdown
              id={fieldId}
              options={field.options?.map((opt) => ({ value: opt, label: opt })) ?? []}
              value={(value as string) || ''}
              onSelect={(_, label) => onChange(label)}
              placeholder={field.placeholder || t('forms.selectPlaceholder')}
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
          ) : (
            <input
              id={fieldId}
              type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              min={field.type === 'date' ? field.minDate : undefined}
              max={field.type === 'date' ? resolveDateBound(field.maxDate) : undefined}
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
  const { t } = useTranslation();
  const reactId = useId();
  const groupId = `${reactId}-${field.name}`;
  const childFields = field.fields ?? [];
  const emptyMessage = repeatableGroupEmptyMessage(field, t);
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
            <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{field.helpText}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange([...value, emptyItem()])}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {field.addLabel ?? t('forms.group.addEntry')}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="mt-4 space-y-5" aria-labelledby={groupId}>
          {value.map((item, index) => (
            <div
              key={index}
              className="border-l-2 border-primary/25 pl-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">
                  {field.itemLabel ?? t('forms.group.entry')} {index + 1}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('forms.group.removeItem', {
                    item: (field.itemLabel ?? t('forms.group.entry')).toLowerCase(),
                    number: index + 1,
                  })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t('forms.group.remove')}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-12">
                {childFields
                  .filter((childField) => childField.type !== 'subheader')
                  .map((childField) => {
                    const childId = `${groupId}-${index}-${childField.name}`;
                    const childLabelId = `${childId}-label`;
                    const childError = errors[`${field.name}.${index}.${childField.name}`];
                    const childHelpId = childField.helpText ? `${childId}-help` : undefined;
                    const childErrorId = childError ? `${childId}-error` : undefined;
                    const describedBy = [childHelpId, childErrorId].filter(Boolean).join(' ') || undefined;
                    const isSearchableSelect =
                      childField.type === 'select' &&
                      (childField.options?.length ?? 0) > SEARCHABLE_SELECT_THRESHOLD;

                    return (
                      <div key={childField.name} className={cn(fieldLayoutClass(childField), 'min-w-0')}>
                        <label id={childLabelId} htmlFor={childId} className={labelClass}>
                          {childField.label}
                          {childField.required && <RequiredMark />}
                        </label>
                        {childField.helpText && (
                          <p id={childHelpId} className="mb-1.5 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
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
                        ) : isSearchableSelect ? (
                          <SearchableCombobox
                            id={childId}
                            options={
                              childField.options?.map((opt) => ({ value: opt, label: opt })) ?? []
                            }
                            value={String(item[childField.name] ?? '')}
                            displayValue={String(item[childField.name] ?? '') || undefined}
                            onSelect={(_, label) => updateItem(index, childField.name, label)}
                            onClear={() => updateItem(index, childField.name, '')}
                            placeholder={childField.placeholder || t('forms.selectPlaceholder')}
                            emptyMessage={t('forms.noMatchingOptions')}
                            ariaLabelledBy={childLabelId}
                            ariaDescribedBy={describedBy}
                            ariaInvalid={!!childError}
                            ariaRequired={childField.required}
                            className={
                              childError
                                ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                                : undefined
                            }
                          />
                        ) : childField.type === 'select' ? (
                          <SelectDropdown
                            id={childId}
                            options={
                              childField.options?.map((opt) => ({ value: opt, label: opt })) ?? []
                            }
                            value={String(item[childField.name] ?? '')}
                            onSelect={(_, label) => updateItem(index, childField.name, label)}
                            placeholder={childField.placeholder || t('forms.selectPlaceholder')}
                            ariaLabelledBy={childLabelId}
                            ariaDescribedBy={describedBy}
                            ariaInvalid={!!childError}
                            ariaRequired={childField.required}
                            className={
                              childError
                                ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                                : undefined
                            }
                          />
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
                            min={childField.type === 'date' ? childField.minDate : undefined}
                            max={
                              childField.type === 'date'
                                ? resolveDateBound(childField.maxDate)
                                : undefined
                            }
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

function repeatableGroupEmptyMessage(field: FormFieldDef, t: TFunction): string {
  const label = (field.label || field.name).trim();
  if (!label) return t('forms.group.emptyNoLabel');
  return t('forms.group.empty', { label: label.toLowerCase() });
}

function RequiredMark() {
  return (
    <span className="ml-1 text-destructive" aria-hidden="true">
      *
    </span>
  );
}
