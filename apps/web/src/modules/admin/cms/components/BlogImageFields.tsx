import { useFormContext } from 'react-hook-form';

import { ImageUpload } from '../../../../components/common/ImageUpload';
import { Input } from '../../../../components/common/Input';

/**
 * The admin Blog form previously had no way to set a cover image or category
 * tag at all (`coverImageUrl`/`tags` exist on the model and are read by the
 * public blog cards, but were never exposed in the form) — every real post
 * an admin published therefore showed "No image" and a generic fallback
 * category on Home/`/blog`. Rendered via `ConfigEntityPage`'s
 * `renderExtraFields` slot, same pattern as `BannerImageFields`.
 */
export function BlogImageFields() {
  const { register, watch, setValue } = useFormContext<Record<string, unknown>>();
  const coverImageUrl = watch('coverImageUrl') as string | undefined;

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Cover image
        </label>
        <ImageUpload
          preset="cms_media"
          folder="blog"
          value={coverImageUrl}
          onUploaded={(asset) => setValue('coverImageUrl', asset.url, { shouldDirty: true })}
          onRemove={coverImageUrl ? () => setValue('coverImageUrl', '', { shouldDirty: true }) : undefined}
        />
      </div>

      <Input
        label="Category (optional)"
        hint="A single category shown as the card badge, e.g. Wellness, Medicine Guide, Healthcare Tips."
        {...register('tags', {
          // react-hook-form can re-invoke this transform on the field's already-stored
          // value (not just the raw DOM string) — e.g. when the "New" drawer reopens
          // and re-registers this field before `reset()`'s blank defaults have applied.
          // Once one create cycle has run, that stored value is already `string[]`
          // (this same transform's own prior output), so `v` isn't reliably a string —
          // guard instead of assuming it, or `v.trim()` throws for non-string input.
          setValueAs: (v: unknown) => {
            if (Array.isArray(v)) return v;
            const trimmed = typeof v === 'string' ? v.trim() : '';
            return trimmed ? [trimmed] : [];
          },
        })}
      />
    </>
  );
}
