import { useState } from 'react';
import type { FormDef, FormFieldDef } from '@itatti/shared';
import { CheckCircle2 } from 'lucide-react';

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
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Thank you!</h2>
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {formDef.sections.map((section, si) => (
        <div key={si} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.description && (
              <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
            )}
          </div>

          <div className="space-y-4">
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
        </div>
      ))}

      {submitError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
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
  const baseInputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50';

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </label>

      {field.helpText && (
        <p className="text-xs text-muted-foreground mb-1.5">{field.helpText}</p>
      )}

      {field.type === 'textarea' ? (
        <textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          rows={4}
          className={baseInputClass}
        />
      ) : field.type === 'select' ? (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'radio' ? (
        <div className="space-y-2">
          {field.options?.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={field.name}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="h-4 w-4 border-input text-primary focus:ring-ring"
              />
              {opt}
            </label>
          ))}
        </div>
      ) : field.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          {field.placeholder || 'Yes'}
        </label>
      ) : (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          className={baseInputClass}
        />
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
