import { useFormContext } from 'react-hook-form';

import { ImageUpload } from '../../../../components/common/ImageUpload';
import { Input } from '../../../../components/common/Input';

/**
 * Website Design (Storefront Management) — the banner image was previously
 * a plain "paste a URL" text input (no Cloudinary upload at all, and no
 * `imagePublicId` ever captured, which is exactly why safe deletion wasn't
 * possible before). Rendered via `ConfigEntityPage`'s `renderExtraFields`
 * slot (the same escape hatch Category's SEO/FAQ fields use) so
 * `setValue('imageUrl', ...)`/`setValue('imagePublicId', ...)` write into
 * the SAME form state that gets submitted — no separate state to merge.
 *
 * `startsAt`/`endsAt` (optional scheduling window) are plain
 * `datetime-local` inputs registered directly — the backend already
 * accepts/enforces these (public route filters by them), they were simply
 * never exposed in the admin form.
 */
export function BannerImageFields() {
  const { register, watch, setValue } = useFormContext<Record<string, unknown>>();
  const imageUrl = watch('imageUrl') as string | undefined;

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Banner image
        </label>
        <ImageUpload
          preset="cms_media"
          folder="banners"
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          type="datetime-local"
          label="Starts at (optional)"
          hint="Leave blank to show immediately."
          {...register('startsAt', { setValueAs: (v: string) => v || null })}
        />
        <Input
          type="datetime-local"
          label="Ends at (optional)"
          hint="Leave blank to show indefinitely."
          {...register('endsAt', { setValueAs: (v: string) => v || null })}
        />
      </div>
    </>
  );
}
