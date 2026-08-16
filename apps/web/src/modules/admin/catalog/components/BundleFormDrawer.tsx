import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { BundleDetail } from '../../../../api/bundles.api';
import type { Product } from '../../../../api/catalog.api';
import { Button } from '../../../../components/common/Button';
import { Checkbox } from '../../../../components/common/Checkbox';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { bundleHooks } from '../hooks/useBundles';
import { productHooks } from '../hooks/useProducts';

const bundleFormSchema = z
  .object({
    productId: z.string().min(1, 'Select the bundle SKU'),
    sellingPrice: z.coerce.number().min(0, 'Must be 0 or more'),
    isActive: z.boolean().optional(),
    items: z
      .array(
        z.object({
          componentProductId: z.string().min(1, 'Select a component product'),
          quantity: z.coerce.number().int().positive('Must be at least 1'),
        }),
      )
      .min(1, 'Add at least one component product'),
  })
  .refine(
    (data) => {
      const ids = data.items.map((i) => i.componentProductId);
      return new Set(ids).size === ids.length;
    },
    { message: 'A component product cannot be listed twice', path: ['items'] },
  )
  .refine((data) => data.items.every((i) => i.componentProductId !== data.productId), {
    message: 'A bundle cannot contain itself as a component',
    path: ['items'],
  });

type BundleFormValues = z.infer<typeof bundleFormSchema>;

const DEFAULT_VALUES: BundleFormValues = {
  productId: '',
  sellingPrice: 0,
  isActive: true,
  items: [{ componentProductId: '', quantity: 1 }],
};

interface BundleFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bundle: BundleDetail | null;
  onRequestDelete?: (bundleId: string) => void;
}

export function BundleFormDrawer({ isOpen, onClose, bundle, onRequestDelete }: BundleFormDrawerProps) {
  const { data: productsResult } = productHooks.useList({ limit: 100 });
  const products: Product[] = productsResult?.items ?? [];
  const productMap = new Map(products.map((p) => [p._id, p]));

  const createMutation = bundleHooks.useCreate();
  const updateMutation = bundleHooks.useUpdate();
  const isEditing = !!bundle;

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BundleFormValues>({
    resolver: zodResolver(bundleFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (bundle) {
      reset({
        productId: bundle.productId,
        sellingPrice: bundle.sellingPrice,
        isActive: bundle.isActive,
        items: bundle.items.length
          ? bundle.items.map((i) => ({ componentProductId: i.componentProductId, quantity: i.quantity }))
          : DEFAULT_VALUES.items,
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [bundle, reset]);

  // Live price-ratio preview (Part 8: "Price ratio preview") — mirrors the
  // exact same `quantity * component.mrp / total` formula bundle.service.ts
  // computes server-side, using the already-loaded product list's `mrp`.
  const watchedItems = watch('items');
  const contributions = watchedItems.map((item) => {
    const product = productMap.get(item.componentProductId);
    const mrp = product?.mrp ?? 0;
    const qty = Number(item.quantity) || 0;
    return { ...item, mrp, contribution: mrp * qty };
  });
  const totalContribution = contributions.reduce((sum, c) => sum + c.contribution, 0);

  async function onSubmit(values: BundleFormValues) {
    const payload = {
      productId: values.productId,
      sellingPrice: values.sellingPrice,
      isActive: values.isActive,
      items: values.items.map((i) => ({
        componentProductId: i.componentProductId,
        quantity: i.quantity,
      })),
    };

    if (isEditing) {
      // productId is fixed at creation — only send the fields the update endpoint accepts.
      await updateMutation.mutateAsync({
        id: bundle._id,
        input: { sellingPrice: payload.sellingPrice, isActive: payload.isActive, items: payload.items },
      });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onClose();
  }

  const productOptions = products.map((p) => ({ label: `${p.name} (${p.sku})`, value: p._id }));

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Bundle' : 'New Bundle'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Select
          label="Bundle product (its own sellable SKU)"
          placeholder="Select a product"
          error={errors.productId?.message}
          disabled={isEditing}
          options={productOptions}
          {...register('productId')}
        />
        {isEditing && (
          <p className="-mt-3 text-xs text-gray-400">
            The bundle&apos;s underlying product SKU can&apos;t be changed after creation.
          </p>
        )}
        {isEditing && bundle && (
          <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
            Calculated inventory:{' '}
            <span className={bundle.availableQty > 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'}>
              {bundle.availableQty > 0 ? `${bundle.availableQty} available` : 'Out of stock'}
            </span>{' '}
            — derived live from component stock, not editable here.
          </p>
        )}

        <Input
          label="Selling price (₹)"
          type="number"
          step="0.01"
          hint="Independently set — never auto-calculated from component prices."
          error={errors.sellingPrice?.message}
          {...register('sellingPrice')}
        />

        <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Components</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => append({ componentProductId: '', quantity: 1 })}
            >
              Add component
            </Button>
          </div>

          {errors.items?.message && (
            <p className="text-xs text-red-600">{errors.items.message}</p>
          )}
          {errors.items?.root?.message && (
            <p className="text-xs text-red-600">{errors.items.root.message}</p>
          )}

          {fields.map((field, index) => {
            const ratio = totalContribution > 0 ? contributions[index]?.contribution / totalContribution : 0;
            return (
              <div key={field.id} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
                <Select
                  label={index === 0 ? 'Component product' : undefined}
                  placeholder="Select a product"
                  options={productOptions}
                  error={errors.items?.[index]?.componentProductId?.message}
                  {...register(`items.${index}.componentProductId` as const)}
                />
                <Input
                  label={index === 0 ? 'Qty' : undefined}
                  type="number"
                  className="w-16"
                  error={errors.items?.[index]?.quantity?.message}
                  {...register(`items.${index}.quantity` as const)}
                />
                <div className="pb-2 text-xs text-gray-500 dark:text-gray-400">
                  {(ratio * 100).toFixed(1)}%
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={fields.length <= 1}
                  onClick={() => remove(index)}
                >
                  Remove
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-gray-400">
            Price ratio is a preview only — used later for GST apportionment, never to change what
            the customer is charged (that&apos;s always the selling price above).
          </p>
        </div>

        <Checkbox label="Active" {...register('isActive')} />

        <div className="mt-2 flex justify-between gap-2">
          {isEditing && onRequestDelete && (
            <Button type="button" variant="danger" onClick={() => onRequestDelete(bundle._id)}>
              Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isEditing ? 'Save changes' : 'Create bundle'}
            </Button>
          </div>
        </div>
      </form>
    </Drawer>
  );
}
