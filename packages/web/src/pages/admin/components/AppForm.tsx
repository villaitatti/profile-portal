import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RoleTagSelect } from './RoleTagSelect';
import { ImageUploader } from './ImageUploader';
import { Loader2 } from 'lucide-react';

// Validation messages are i18n keys, resolved with t() at the render site so
// they follow the active language.
const appFormSchema = z.object({
  name: z.string().min(1, 'admin.apps.form.validation.nameRequired').max(200),
  description: z.string().max(1000).optional(),
  url: z.string().url('admin.apps.form.validation.urlInvalid'),
  imageUrl: z.string().optional().or(z.literal('')),
  blurPlaceholder: z.string().optional(),
  loginMethod: z.enum(['vit-id', 'harvard-key', 'none']),
  requiredRoles: z.array(z.string()).min(1, 'admin.apps.form.validation.rolesRequired'),
  // <number> pins the coerce input type: Zod 4 defaults it to `unknown`,
  // which breaks react-hook-form's resolver generics.
  sortOrder: z.coerce.number<number>().int().optional(),
});

export type AppFormData = z.infer<typeof appFormSchema>;

interface AppFormProps {
  defaultValues?: Partial<AppFormData>;
  onSubmit: (data: AppFormData) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function AppForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
}: AppFormProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AppFormData>({
    resolver: zodResolver(appFormSchema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      imageUrl: '',
      blurPlaceholder: '',
      loginMethod: 'vit-id' as const,
      requiredRoles: [],
      sortOrder: 0,
      ...defaultValues,
    },
  });

  const imageUrl = watch('imageUrl');
  const blurPlaceholder = watch('blurPlaceholder');

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-6">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.nameLabel')}
        </label>
        <input
          {...register('name')}
          type="text"
          id="name"
          className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.name?.message && (
          <p className="text-sm text-destructive mt-1">{t(errors.name.message)}</p>
        )}
      </div>

      <div>
        <label htmlFor="url" className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.urlLabel')}
        </label>
        <input
          {...register('url')}
          type="url"
          id="url"
          placeholder="https://..."
          className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.url?.message && (
          <p className="text-sm text-destructive mt-1">{t(errors.url.message)}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.descriptionLabel')}{' '}
          <span className="text-muted-foreground">{t('admin.apps.form.optional')}</span>
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.previewImageLabel')}{' '}
          <span className="text-muted-foreground">{t('admin.apps.form.previewImageHint')}</span>
        </label>
        <ImageUploader
          value={imageUrl || undefined}
          blurPlaceholder={blurPlaceholder || undefined}
          onChange={(url, blur) => {
            setValue('imageUrl', url, { shouldDirty: true });
            setValue('blurPlaceholder', blur, { shouldDirty: true });
          }}
          onClear={() => {
            setValue('imageUrl', '', { shouldDirty: true });
            setValue('blurPlaceholder', '', { shouldDirty: true });
          }}
        />
        {errors.imageUrl?.message && (
          <p className="text-sm text-destructive mt-1">{t(errors.imageUrl.message)}</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.authentication')}
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('loginMethod')}
              type="radio"
              value="vit-id"
              className="accent-primary"
            />
            <span className="text-[0.95rem]">{t('admin.apps.form.loginVitId')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('loginMethod')}
              type="radio"
              value="harvard-key"
              className="accent-primary"
            />
            <span className="text-[0.95rem]">{t('admin.apps.form.loginHarvardKey')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('loginMethod')}
              type="radio"
              value="none"
              className="accent-primary"
            />
            <span className="text-[0.95rem]">{t('admin.apps.form.loginNone')}</span>
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="sortOrder" className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.sortOrder')}
        </label>
        <input
          {...register('sortOrder')}
          type="number"
          id="sortOrder"
          className="w-28 rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[0.95rem] font-medium">
          {t('admin.apps.form.visibleToRoles')}
        </label>
        <Controller
          name="requiredRoles"
          control={control}
          render={({ field }) => (
            <RoleTagSelect value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.requiredRoles?.message && (
          <p className="text-sm text-destructive mt-1">
            {t(errors.requiredRoles.message)}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="px-5" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 data-icon="inline-start" className="animate-spin" />
            {t('admin.apps.form.saving')}
          </>
        ) : (
          submitLabel ?? t('common.save')
        )}
      </Button>
    </form>
  );
}
