import { useFieldArray, useFormContext, type Control } from 'react-hook-form';

import { Button } from '../../../../components/common/Button';
import { Input } from '../../../../components/common/Input';
import { Textarea } from '../../../../components/common/Textarea';

/**
 * `ConfigEntityPage`'s form is generically typed as `Record<string, unknown>`
 * (it has no compile-time knowledge of any given entity's shape), which
 * means `useFieldArray`'s `name` prop can't be inferred as pointing at an
 * actual array — `Record<string, unknown>['faq']` is `unknown`, not an
 * array type. This local shape is only used to type the `useFieldArray`
 * call correctly; it doesn't change what's actually registered/submitted
 * (still the same shared form instance via `useFormContext`).
 */
interface CategoryFormShape {
  faq: { question: string; answer: string }[];
}

/**
 * Part 15/18/28/29/40 (wired up here, follow-up to  23) —
 * Category's `seo`/`faq` fields already existed on the backend model and
 * were already accepted by `category.validator.ts`/audited by
 * `category.service.ts` (`CATEGORY_SEO_UPDATED`), but had no admin UI: the
 * generic `ConfigEntityPage` only understood flat top-level fields, not a
 * nested `seo` object or a repeatable `faq` array.
 *
 * Rendered via `ConfigEntityPage`'s `renderExtraFields` slot inside the
 * SAME `FormProvider`-wrapped form as the declarative fields, so
 * `register('seo.metaTitle')`/`useFieldArray({ name: 'faq' })` read/write
 * the exact form state that gets submitted — no separate state, no manual
 * merge step. Field layout/copy mirrors ProductFormDrawer.tsx's SEO
 * section for admin UI consistency (Product uses flat `seoTitle`/
 * `seoDescription`/`seoCanonicalUrl` field names internally and maps them
 * to `seo.*` at submit time instead of registering the nested path
 * directly; Category registers the nested path directly since
 * `ConfigEntityPage`'s generic submit handler has no per-entity mapping
 * step to hook a translation into — both approaches produce the identical
 * `{ seo: { metaTitle, metaDescription, canonicalUrl } }` payload shape
 * the backend expects).
 */
export function CategorySeoFaqFields() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();

  const { fields, append, remove } = useFieldArray({
    control: control as unknown as Control<CategoryFormShape>,
    name: 'faq',
  });

  const seoErrors = (errors.seo ?? {}) as Record<string, { message?: string } | undefined>;
  const faqErrors = errors.faq as
    | { message?: string; root?: { message?: string } }
    | { question?: { message?: string }; answer?: { message?: string } }[]
    | undefined;
  const faqListError =
    faqErrors && !Array.isArray(faqErrors) ? (faqErrors.message ?? faqErrors.root?.message) : undefined;

  return (
    <>
      <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">SEO</h3>
        <div className="flex flex-col gap-3">
          <Input
            label="SEO title"
            hint="Shown as the browser tab title / search-result heading. Falls back to the category name when blank."
            error={seoErrors.metaTitle?.message}
            {...register('seo.metaTitle')}
          />
          <Input
            label="Meta description"
            hint="Shown under the title in search results. Falls back to the category description when blank."
            error={seoErrors.metaDescription?.message}
            {...register('seo.metaDescription')}
          />
          <Input
            label="Canonical URL"
            hint="Leave blank to use the default /categories/:slug URL."
            error={seoErrors.canonicalUrl?.message}
            {...register('seo.canonicalUrl')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Frequently Asked Questions
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => append({ question: '', answer: '' })}
          >
            Add question
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Shown on the storefront category page and marked up as FAQPage structured data for AI/search
          answer engines. Admin-authored only — never generated automatically.
        </p>

        {faqListError && <p className="text-xs text-red-600">{faqListError}</p>}

        {fields.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No FAQ entries yet.</p>
        )}

        {fields.map((field, index) => {
          const rowErrors = Array.isArray(faqErrors) ? faqErrors[index] : undefined;
          return (
            <div key={field.id} className="flex flex-col gap-2 rounded border border-gray-100 p-2 dark:border-gray-800/60">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    label={index === 0 ? 'Question' : undefined}
                    error={rowErrors?.question?.message}
                    {...register(`faq.${index}.question` as const)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  className={index === 0 ? 'mt-6' : undefined}
                  onClick={() => remove(index)}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                label={index === 0 ? 'Answer' : undefined}
                error={rowErrors?.answer?.message}
                {...register(`faq.${index}.answer` as const)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
