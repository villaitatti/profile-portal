import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { useApplications } from '@/api/applications';

interface ImageGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (imageUrl: string, blurPlaceholder: string) => void;
}

export function ImageGallery({ open, onOpenChange, onSelect }: ImageGalleryProps) {
  const { data: applications, isLoading } = useApplications();

  const appsWithImages = applications?.filter((app) => app.imageUrl) ?? [];

  const handleSelect = (imageUrl: string, blurPlaceholder: string) => {
    onSelect(imageUrl, blurPlaceholder);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              Image gallery
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : appsWithImages.length === 0 ? (
            <div className="py-12 text-center text-[0.95rem] text-muted-foreground">
              No images uploaded yet
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
