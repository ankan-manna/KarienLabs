import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import {
  addSubProductImage,
  getProductImageConfig,
  removeSubProductImage,
  setMainProductImage,
  type Product,
} from '../../../../api/catalog.api';
import { uploadImageDirect, type UploadedAsset } from '../../../../api/uploads.api';
import { Button } from '../../../../components/common/Button';
import { Spinner } from '../../../../components/common/Spinner';
import { toast } from '../../../../utils/toast';

export interface ProductImageManagerHandle {
  /**
   * Called by ProductFormDrawer right after a NEW product is created, to
   * attach whatever was staged before the product existed. Attempts every
   * staged image independently (main, then each sub) rather than stopping
   * at the first failure — one bad network call shouldn't also cost the
   * images staged after it. Returns how many failed so the caller can
   * surface a clear, specific message instead of nothing at all.
   */
  flushStaged: (productId: string) => Promise<{ attempted: number; failed: number }>;
}

interface ProductImageManagerProps {
  mode: 'create' | 'edit';
  product: Product | null;
}

const UPLOAD_FOLDER = 'products';
// Part 32 — exact wording the  specifies for a failed Cloudinary upload.
const UPLOAD_FAILED_MESSAGE = 'Product image upload failed. Please try again.';

type ImageRef = { url: string; publicId: string };

/**
 *  (Product Image Management) Part 3/4/18 — one Main Image slot +
 * up to `maxSubImages` (Super-Admin-configured, Part 4) Additional Images,
 * visually separated per Part 3's explicit requirement. Reuses the existing
 * signed direct-to-Cloudinary upload flow (`uploadImageDirect`, same one
 * `ImageUpload.tsx` already uses elsewhere) — no new upload mechanism.
 *
 * CREATE mode: the product doesn't exist yet, so images are uploaded to
 * Cloudinary immediately (for instant preview) but only ATTACHED to the
 * product (via `flushStaged`) after `ProductFormDrawer` successfully creates
 * it — matches Part 3's "preview before submitting."
 *
 * EDIT mode: the product already exists, so every action (replace main, add
 * sub, remove sub) calls its API immediately and updates a local
 * `liveImages` snapshot so the open drawer reflects the change right away,
 * without waiting on the admin table's own list query to refetch.
 */
export const ProductImageManager = forwardRef<ProductImageManagerHandle, ProductImageManagerProps>(
  function ProductImageManager({ mode, product }, ref) {
    const queryClient = useQueryClient();
    const mainInputRef = useRef<HTMLInputElement>(null);
    const subInputRef = useRef<HTMLInputElement>(null);

    const { data: config } = useQuery({
      queryKey: ['products', 'image-config'],
      queryFn: getProductImageConfig,
      staleTime: 60_000,
    });
    const maxSubImages = config?.maxSubImages ?? 5;

    // Create-mode staged state.
    const [stagedMain, setStagedMain] = useState<UploadedAsset | null>(null);
    const [stagedSubs, setStagedSubs] = useState<UploadedAsset[]>([]);
    const [uploadingMain, setUploadingMain] = useState(false);
    const [uploadingSub, setUploadingSub] = useState(false);

    // Edit-mode live snapshot, reset whenever the drawer is opened for a (possibly different) product.
    const [liveImages, setLiveImages] = useState<{
      mainImage: Product['mainImage'];
      subImages: Product['subImages'];
    } | null>(null);
    useEffect(() => {
      setLiveImages(product ? { mainImage: product.mainImage, subImages: product.subImages } : null);
    }, [product?._id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only on identity change, not every field update

    useImperativeHandle(ref, () => ({
      async flushStaged(productId: string) {
        const attempted = (stagedMain ? 1 : 0) + stagedSubs.length;
        let failed = 0;

        if (stagedMain) {
          try {
            await setMainProductImage(productId, stagedMain);
          } catch {
            failed += 1;
          }
        }
        for (const sub of stagedSubs) {
          try {
            await addSubProductImage(productId, sub);
          } catch {
            failed += 1;
          }
        }
        if (attempted > 0) {
          queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
        }
        return { attempted, failed };
      },
    }));

    const setMainMutation = useMutation({
      mutationFn: (asset: UploadedAsset) => setMainProductImage(product!._id, asset),
      onSuccess: (updated) => {
        setLiveImages({ mainImage: updated.mainImage, subImages: updated.subImages });
        queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
        toast.success('Main image updated');
      },
      onError: (err: Error) => toast.error(err.message),
    });

    const addSubMutation = useMutation({
      mutationFn: (asset: UploadedAsset) => addSubProductImage(product!._id, asset),
      onSuccess: (updated) => {
        setLiveImages({ mainImage: updated.mainImage, subImages: updated.subImages });
        queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
      },
      onError: (err: Error) => toast.error(err.message),
    });

    const removeSubMutation = useMutation({
      mutationFn: (publicId: string) => removeSubProductImage(product!._id, publicId),
      onSuccess: (updated) => {
        setLiveImages({ mainImage: updated.mainImage, subImages: updated.subImages });
        queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
        toast.success('Image removed');
      },
      onError: (err: Error) => toast.error(err.message),
    });

    const currentMain: ImageRef | null = mode === 'create' ? stagedMain : (liveImages?.mainImage ?? null);
    const currentSubs: ImageRef[] =
      mode === 'create' ? stagedSubs : (liveImages?.subImages ?? []);
    const subLimitReached = currentSubs.length >= maxSubImages;

    async function handleMainFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingMain(true);
      try {
        const asset = await uploadImageDirect(file, 'product_thumbnail', UPLOAD_FOLDER);
        if (mode === 'create') {
          setStagedMain(asset);
        } else {
          await setMainMutation.mutateAsync(asset);
        }
      } catch {
        toast.error(UPLOAD_FAILED_MESSAGE);
      } finally {
        setUploadingMain(false);
        if (mainInputRef.current) mainInputRef.current.value = '';
      }
    }

    async function handleSubFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (subLimitReached) {
        toast.error(`Maximum of ${maxSubImages} additional images allowed`);
        if (subInputRef.current) subInputRef.current.value = '';
        return;
      }
      setUploadingSub(true);
      try {
        const asset = await uploadImageDirect(file, 'product_thumbnail', UPLOAD_FOLDER);
        if (mode === 'create') {
          setStagedSubs((prev) => [...prev, asset]);
        } else {
          await addSubMutation.mutateAsync(asset);
        }
      } catch {
        toast.error(UPLOAD_FAILED_MESSAGE);
      } finally {
        setUploadingSub(false);
        if (subInputRef.current) subInputRef.current.value = '';
      }
    }

    function removeStagedSub(publicId: string) {
      setStagedSubs((prev) => prev.filter((img) => img.publicId !== publicId));
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Main Product Image</h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            The primary image used throughout the catalog (Home, All Products, product cards).
          </p>
          <div className="flex items-center gap-3">
            {currentMain ? (
              <img
                src={currentMain.url}
                alt="Main"
                className="h-24 w-24 rounded-md border border-gray-200 object-cover dark:border-gray-700"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
                No image
              </div>
            )}
            <input
              ref={mainInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleMainFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={uploadingMain || setMainMutation.isPending}
              onClick={() => mainInputRef.current?.click()}
            >
              {uploadingMain || setMainMutation.isPending ? (
                <Spinner size="sm" />
              ) : currentMain ? (
                'Replace Main Image'
              ) : (
                'Upload Main Image'
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Additional Product Images
            </h3>
            <span className="text-xs text-gray-400">
              {currentSubs.length} / {maxSubImages}
            </span>
          </div>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Shown as thumbnails in the product gallery. Maximum sub-images is configured by Super Admin.
          </p>
          <div className="flex flex-wrap gap-3">
            {currentSubs.map((img) => (
              <div key={img.publicId} className="relative">
                <img
                  src={img.url}
                  alt="Additional"
                  className="h-20 w-20 rounded-md border border-gray-200 object-cover dark:border-gray-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    mode === 'create' ? removeStagedSub(img.publicId) : removeSubMutation.mutate(img.publicId)
                  }
                  disabled={removeSubMutation.isPending}
                  className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white shadow disabled:opacity-50"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}

            <input
              ref={subInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSubFileChange}
            />
            <button
              type="button"
              disabled={subLimitReached || uploadingSub || addSubMutation.isPending}
              onClick={() => subInputRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-xs text-gray-400 hover:border-brand-400 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
            >
              {uploadingSub || addSubMutation.isPending ? <Spinner size="sm" /> : '+ Add'}
            </button>
          </div>
          {subLimitReached && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Maximum of {maxSubImages} additional images reached.
            </p>
          )}
        </div>
      </div>
    );
  },
);
