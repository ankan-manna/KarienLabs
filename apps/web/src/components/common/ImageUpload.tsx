import { useRef, useState } from 'react';

import { uploadImageDirect, type UploadedAsset, type UploadPreset } from '../../api/uploads.api';
import { toast } from '../../utils/toast';

import { Button } from './Button';
import { Spinner } from './Spinner';

interface ImageUploadProps {
  preset: UploadPreset;
  folder: string;
  value?: string | null;
  onUploaded: (asset: UploadedAsset) => void;
  onRemove?: () => void;
}

/** Single-image uploader wired to the signed direct-to-Cloudinary flow (see uploads.api.ts). For multi-file, render N of these or extend with an array value. */
export function ImageUpload({ preset, folder, value, onUploaded, onRemove }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const asset = await uploadImageDirect(file, preset, folder);
      onUploaded(asset);
    } catch {
      toast.error('Image upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="Uploaded"
            className="h-20 w-20 rounded-md border border-gray-200 object-cover dark:border-gray-700"
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white shadow"
              aria-label="Remove image"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
          No image
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? <Spinner size="sm" /> : value ? 'Replace' : 'Upload'}
      </Button>
    </div>
  );
}
