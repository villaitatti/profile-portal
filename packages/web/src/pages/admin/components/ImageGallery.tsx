import { useTranslation } from 'react-i18next';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2, X } from 'lucide-react';
import { useApplications } from '@/api/applications';

interface ImageGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (imageUrl: string, blurPlaceholder: string) => void;
}

export function ImageGallery({ open, onOpenChange, onSelect }: ImageGalleryProps) {
  const { t } = useTranslation();
  const { data: applications, isLoading } = useApplications();

  const appsWithImages = applications?.filter((app) => app.imageUrl) ?? [];

  const handleSelect = (imageUrl: string, blurPlaceholder: string) => {
    onSelect(imageUrl, blurPlaceholder);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen)}>
      <DialogContent showCloseButton={false} className="block max-w-[calc(100%-2rem)] gap-0 p-6 sm:max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <DialogTitle className="text-lg font-semibold">
            {t('admin.images.galleryTitle')}
          </DialogTitle>
          <DialogClose
            render={
              <button
                type="button"
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label={t('common.close')}
              />
            }
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : appsWithImages.length === 0 ? (
          <div className="py-12 text-center text-[0.95rem] text-muted-foreground">
            {t('admin.images.noImages')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto sm:grid-cols-3">
            {appsWithImages.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() =>
                  handleSelect(app.imageUrl!, app.blurPlaceholder ?? '')
                }
                className="group flex flex-col overflow-hidden rounded-md border transition-colors hover:border-primary"
              >
                <img
                  src={app.imageUrl!}
                  alt={app.name}
                  className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                />
                <span className="px-2 py-1.5 text-[0.78rem] font-medium truncate">
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
