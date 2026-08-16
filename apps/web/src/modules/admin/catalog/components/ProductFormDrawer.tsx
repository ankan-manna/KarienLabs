import { zodResolver } from '@hookform/resolvers/zod';
import { resolveProductDefaults } from '@medcommerce/shared';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import type { Product } from '../../../../api/catalog.api';
import { Button } from '../../../../components/common/Button';
import { Checkbox } from '../../../../components/common/Checkbox';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { toast } from '../../../../utils/toast';
import {
  TRI_STATE_OPTIONS,
  productFormSchema,
  type ProductFormValues,
} from '../../../../validators/product.validators';
import { categoryHooks } from '../hooks/useCategories';
import { productHooks } from '../hooks/useProducts';

import { ProductImageManager, type ProductImageManagerHandle } from './ProductImageManager';

interface ProductFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

const DEFAULT_VALUES: ProductFormValues = {
  name: '',
  sku: '',
  categoryId: '',
  basePrice: 0,
  mrp: 0,
  gstRate: 12,
  shippingCharge: 0,
  reorderLevel: 10,
  genericName: '',
  prescriptionRequired: 'inherit',
  expirable: 'inherit',
  coldStorage: false,
  isActive: true,
  barcode: '',
  weightGrams: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  seoTitle: '',
  seoDescription: '',
  seoCanonicalUrl: '',
};

/** null/undefined -> 'inherit', true -> 'true', false -> 'false' — the inverse of the submit-time conversion below. */
function triStateToForm(value: boolean | null | undefined): 'inherit' | 'true' | 'false' {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'inherit';
}

function formToTriState(value: 'inherit' | 'true' | 'false'): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function numberOrNull(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function ProductFormDrawer({ isOpen, onClose, product }: ProductFormDrawerProps) {
  const { data: categoriesResult } = categoryHooks.useList({ limit: 100 });
  const createMutation = productHooks.useCreate();
  const updateMutation = productHooks.useUpdate();
  const isEditing = !!product;
  const imageManagerRef = useRef<ProductImageManagerHandle>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        categoryId: product.categoryId,
        brandId: product.brandId ?? undefined,
        basePrice: product.basePrice,
        mrp: product.mrp,
        gstRate: product.gstRate,
        shippingCharge: product.shippingCharge,
        reorderLevel: product.reorderLevel,
        genericName: product.medicine?.genericName ?? '',
        prescriptionRequired: triStateToForm(product.medicine?.prescriptionRequired),
        expirable: triStateToForm(product.expirable),
        coldStorage: product.medicine?.coldStorage ?? false,
        isActive: product.isActive,
        barcode: product.barcode ?? '',
        weightGrams: product.weightGrams != null ? String(product.weightGrams) : '',
        lengthMm: product.lengthMm != null ? String(product.lengthMm) : '',
        widthMm: product.widthMm != null ? String(product.widthMm) : '',
        heightMm: product.heightMm != null ? String(product.heightMm) : '',
        seoTitle: product.seo?.metaTitle ?? '',
        seoDescription: product.seo?.metaDescription ?? '',
        seoCanonicalUrl: product.seo?.canonicalUrl ?? '',
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [product, reset]);

  // Live "Effective: YES/NO" preview (Part 10) — recomputed as the admin
  // changes either the category or the tri-state override, using the exact
  // same resolution the backend applies at checkout/invoice time.
  const selectedCategoryId = watch('categoryId');
  const watchedPrescription = watch('prescriptionRequired');
  const watchedExpirable = watch('expirable');
  const selectedCategory = categoriesResult?.items.find((c) => c._id === selectedCategoryId);
  const effective = resolveProductDefaults(
    {
      expirable: formToTriState(watchedExpirable ?? 'inherit'),
      medicine: { prescriptionRequired: formToTriState(watchedPrescription ?? 'inherit') },
    },
    selectedCategory,
  );

  async function onSubmit(values: ProductFormValues) {
    const payload = {
      name: values.name,
      sku: values.sku,
      categoryId: values.categoryId,
      basePrice: values.basePrice,
      mrp: values.mrp,
      gstRate: values.gstRate,
      shippingCharge: values.shippingCharge,
      reorderLevel: values.reorderLevel,
      isActive: values.isActive,
      medicine: {
        genericName: values.genericName,
        prescriptionRequired: formToTriState(values.prescriptionRequired),
        coldStorage: values.coldStorage ?? false,
      },
      expirable: formToTriState(values.expirable),
      barcode: values.barcode?.trim() || null,
      weightGrams: numberOrNull(values.weightGrams),
      lengthMm: numberOrNull(values.lengthMm),
      widthMm: numberOrNull(values.widthMm),
      heightMm: numberOrNull(values.heightMm),
      seo: {
        metaTitle: values.seoTitle?.trim() ?? '',
        metaDescription: values.seoDescription?.trim() ?? '',
        canonicalUrl: values.seoCanonicalUrl?.trim() ?? '',
      },
    };

    if (isEditing) {
      await updateMutation.mutateAsync({ id: product._id, input: payload });
    } else {
      const created = await createMutation.mutateAsync(payload);
      // Bugfix (Order/Shiprocket/Invoice/Image) Part 6 — this call used to
      // be un-caught: `createMutation`'s own "Created successfully" toast
      // had already fired by this point, so if attaching the staged images
      // failed (network blip, a 5th sub-image race, session expiry), the
      // rejection became a silent unhandled promise — the admin saw
      // "success" with no indication their picked images never attached.
      // `flushStaged` itself no longer stops at the first failure (Part 6 —
      // "partial upload cleanup"/"error handling"), so this only needs to
      // report the outcome, not retry anything itself.
      try {
        const { attempted, failed } = (await imageManagerRef.current?.flushStaged(created._id)) ?? {
          attempted: 0,
          failed: 0,
        };
        if (failed > 0) {
          toast.error(
            `Product created, but ${failed} of ${attempted} image(s) failed to attach. Edit the product to retry.`,
          );
        }
      } catch {
        toast.error('Product created, but its images failed to attach. Edit the product to retry.');
      }
    }
    onClose();
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Product' : 'New Product'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input label="Product name" error={errors.name?.message} {...register('name')} />
        <Input label="SKU" error={errors.sku?.message} {...register('sku')} />

        <Select
          label="Category"
          placeholder="Select a category"
          error={errors.categoryId?.message}
          options={(categoriesResult?.items ?? []).map((c) => ({ label: c.name, value: c._id }))}
          {...register('categoryId')}
        />

        <ProductImageManager ref={imageManagerRef} mode={isEditing ? 'edit' : 'create'} product={product} />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Base price (₹)"
            type="number"
            step="0.01"
            error={errors.basePrice?.message}
            {...register('basePrice')}
          />
          <Input
            label="MRP (₹)"
            type="number"
            step="0.01"
            error={errors.mrp?.message}
            {...register('mrp')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="GST rate (%)"
            type="number"
            error={errors.gstRate?.message}
            {...register('gstRate')}
          />
          <Input
            label="Reorder level"
            type="number"
            error={errors.reorderLevel?.message}
            {...register('reorderLevel')}
          />
        </div>

        <Input
          label="Shipping charge (₹ per unit)"
          type="number"
          step="0.01"
          hint="Charged per unit purchased, added to the order's shipping total alongside any configured shipping-zone rules. Leave 0 for free shipping on this product."
          error={errors.shippingCharge?.message}
          {...register('shippingCharge')}
        />

        <Input label="Generic name" {...register('genericName')} />
        <Input
          label="Barcode"
          hint="Must be unique across the catalog. Leave blank if not yet assigned."
          error={errors.barcode?.message}
          {...register('barcode')}
        />

        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Shipping attributes
          </h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Used by warehouse packing and the future shipping-label integration — not required now.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Weight (grams)" type="number" {...register('weightGrams')} />
            <div className="grid grid-cols-3 gap-2">
              <Input label="L (mm)" type="number" {...register('lengthMm')} />
              <Input label="W (mm)" type="number" {...register('widthMm')} />
              <Input label="H (mm)" type="number" {...register('heightMm')} />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Category-inherited behavior
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prescription required"
              options={[...TRI_STATE_OPTIONS]}
              {...register('prescriptionRequired')}
            />
            <Select label="Expirable" options={[...TRI_STATE_OPTIONS]} {...register('expirable')} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>
              Effective prescription required:{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {effective.requiresPrescription ? 'YES' : 'NO'}
              </span>
            </span>
            <span>
              Effective expirable:{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {effective.isExpirable ? 'YES' : 'NO'}
              </span>
            </span>
          </div>
        </div>

        <Checkbox label="Requires cold storage" {...register('coldStorage')} />
        <Checkbox label="Active" {...register('isActive')} />

        {/* Prompt 23 Part 13/18/40 — product SEO metadata; the model field
            already existed (Prompt 12) but was never editable until now. */}
        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">SEO</h3>
          <div className="flex flex-col gap-3">
            <Input
              label="SEO title"
              hint="Shown as the browser tab title / search-result heading. Falls back to the product name when blank."
              error={errors.seoTitle?.message}
              {...register('seoTitle')}
            />
            <Input
              label="Meta description"
              hint="Shown under the title in search results. Falls back to the short description when blank."
              error={errors.seoDescription?.message}
              {...register('seoDescription')}
            />
            <Input
              label="Canonical URL"
              hint="Leave blank to use the default /products/:slug URL."
              error={errors.seoCanonicalUrl?.message}
              {...register('seoCanonicalUrl')}
            />
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
