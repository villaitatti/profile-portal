import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RoleMultiSelect } from './RoleMultiSelect';
import { Loader2 } from 'lucide-react';

const appFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  url: z.string().url('Please enter a valid URL'),
  imageUrl: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  loginMethod: z.enum(['vit-id', 'harvard-key']),
  requiredRoles: z.array(z.string()).min(1, 'Select at least one role'),
  sortOrder: z.coerce.number().int().optional(),
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
  submitLabel = 'Save',
}: AppFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AppFormData>({
    resolver: zodResolver(appFormSchema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      imageUrl: '',
      loginMethod: 'vit-id' as const,
      requiredRoles: [],
      sortOrder: 0,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-[0.95rem] font-medium">
          Application name
        </label>
        <input
          {...register('name')}
          type="text"
          id="name"
          className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.name && (
          <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="url" className="mb-1.5 block text-[0.95rem] font-medium">
          Application URL
        </label>
        <input
          {...register('url')}
          type="url"
          id="url"
          placeholder="https://..."
          className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.url && (
          <p className="text-sm text-destructive mt-1">{errors.url.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-[0.95rem] font-medium">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="imageUrl" className="mb-1.5 block text-[0.95rem] font-medium">
          Preview image URL <span className="text-muted-foreground">(optional — screenshot or homepage image)</span>
        </label>
        <input
          {...register('imageUrl')}
          type="url"
          id="imageUrl"
          placeholder="https://..."
          className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.imageUrl && (
          <p className="text-sm text-destructive mt-1">{errors.imageUrl.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[0.95rem] font-medium">
          Log in with
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('loginMethod')}
              type="radio"
              value="vit-id"
              className="accent-primary"
            />
            <span className="text-[0.95rem]">VIT ID</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('loginMethod')}
              type="radio"
              value="harvard-key"
              className="accent-primary"
            />
            <span className="text-[0.95rem]">Harvard Key</span>
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="sortOrder" className="mb-1.5 block text-[0.95rem] font-medium">
          Sort order
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
          Visible to roles
        </label>
        <Controller
          name="requiredRoles"
          control={control}
          render={({ field }) => (
            <RoleMultiSelect value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.requiredRoles && (
          <p className="text-sm text-destructive mt-1">
            {errors.requiredRoles.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
