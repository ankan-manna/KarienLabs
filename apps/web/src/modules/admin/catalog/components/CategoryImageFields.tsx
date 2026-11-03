import { useFormContext } from 'react-hook-form';

import { ImageUpload } from '../../../../components/common/ImageUpload';
import { Input } from '../../../../components/common/Input';

/**
 * Dynamic CMS (Prompt 3) — the homepage "Shop by Category" tiles previously
 * read images from a hardcoded `CATEGORY_PHOTOS` object keyed by slug
 * (HomePage.tsx), with no admin control at all. This gives the Category
 * record its own Cloudinary-managed `imageUrl`/`imagePublicId` pair (same
 * shape as Banner's — see BannerImageFields.tsx), rendered via
 * `ConfigEntityPage`'s `renderExtraFields` slot alongside the existing
 * SEO/FAQ fields.
 */
export function CategoryImageFields() {
  const { register, watch, setValue } = useFormContext<Record<string, unknown>>();
  const imageUrl = watch('imageUrl') as string | undefined;

  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Category image
      </h3>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        Shown on the storefront homepage &amp; category grid. Landscape, roughly 4:5 to 3:4
        portrait composition works best — matches the other category tiles.
      </p>
      {!imageUrl && (
        <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          No image set — the storefront will show a neutral placeholder for this category.
        </p>
      )}
      <ImageUpload
        preset="cms_media"
        folder="categories"
        value={imageUrl}
        onUploaded={(asset) => {
          setValue('imageUrl', asset.url, { shouldDirty: true });
          setValue('imagePublicId', asset.publicId, { shouldDirty: true });
        }}
        onRemove={
          imageUrl
            ? () => {
                setValue('imageUrl', '', { shouldDirty: true });
                setValue('imagePublicId', null, { shouldDirty: true });
              }
            : undefined
        }
      />
      <div className="mt-3">
        <Input
          label="Image alt text (optional)"
          hint="Describes the image for screen readers. Falls back to the category name if left blank."
          {...register('imageAlt')}
        />
      </div>
    </div>
  );
}
