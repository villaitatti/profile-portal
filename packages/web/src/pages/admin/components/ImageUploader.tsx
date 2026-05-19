import { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import * as Dialog from '@radix-ui/react-dialog';
import { ImagePlus, Loader2, Trash2, Images, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadImage, useUploadToken } from '@/api/uploads';
import { ImageGallery } from './ImageGallery';

interface ImageUploaderProps {
  value: string | undefined;
  blurPlaceholder: string | undefined;
  onChange: (imageUrl: string, blurPlaceholder: string) => void;
  onClear: () => void;
}

async function getCroppedImg(imageSrc: string, cropArea: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/webp',
      0.85
    );
  });
}

export function ImageUploader({ value, blurPlaceholder, onChange, onClear }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const getToken = useUploadToken();

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setIsUploading(true);
    setError(null);

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const token = await getToken();
      const result = await uploadImage(croppedBlob, token);
      onChange(result.url, result.blurPlaceholder);
      setCropModalOpen(false);
      setImageSrc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGallerySelect = (imageUrl: string, blur: string) => {
    onChange(imageUrl, blur);
    setGalleryOpen(false);
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="relative rounded-md border overflow-hidden">
          <img
            src={value}
            alt="Preview"
            className="w-full h-40 object-cover"
            style={
              blurPlaceholder
                ? { backgroundImage: `url(${blurPlaceholder})`, backgroundSize: 'cover' }
                : undefined
            }
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 rounded-full bg-destructive p-1.5 text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-colors"
            aria-label="Remove image"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          <ImagePlus className="h-8 w-8 text-muted-foreground" />
          <p className="text-[0.95rem] text-muted-foreground">
            Drag and drop an image, or click to browse
          </p>
          <p className="text-[0.78rem] text-muted-foreground">
            Image will be cropped to 16:9
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="flex gap-2">
        {value && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.78rem] font-medium hover:bg-muted/50 transition-colors"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Replace
          </button>
        )}
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.78rem] font-medium hover:bg-muted/50 transition-colors"
        >
          <Images className="h-3.5 w-3.5" />
          Browse gallery
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Crop Modal */}
      <Dialog.Root open={cropModalOpen} onOpenChange={setCropModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold">
                Crop image
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

            <div className="relative h-64 w-full rounded-md overflow-hidden bg-muted">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <label className="text-[0.78rem] text-muted-foreground">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-[0.95rem] font-medium hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleCropConfirm}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[0.95rem] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Crop & upload'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Gallery Modal */}
      <ImageGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSelect={handleGallerySelect}
      />
    </div>
  );
}
