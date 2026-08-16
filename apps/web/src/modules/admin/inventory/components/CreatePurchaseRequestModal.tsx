import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../../../../components/common/Button';
import { Input } from '../../../../components/common/Input';
import { Modal } from '../../../../components/common/Modal';
import { Select } from '../../../../components/common/Select';
import { Textarea } from '../../../../components/common/Textarea';
import { productHooks } from '../../catalog/hooks/useProducts';
import { useCreatePurchaseRequest } from '../hooks/useAdminPurchaseRequests';
import { warehouseHooks } from '../hooks/useWarehouses';

const itemSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  estimatedUnitCost: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  notes: z.string().optional(),
});

const formSchema = z.object({
  warehouseId: z.string().trim().min(1, 'Warehouse is required'),
  items: z.array(itemSchema).min(1, 'At least one item is required'),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY_ITEM = { productId: '', quantity: 1, estimatedUnitCost: '', notes: '' } as const;

export function CreatePurchaseRequestModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: warehouses } = warehouseHooks.useList({ page: 1, limit: 100 });
  const { data: products } = productHooks.useList({ page: 1, limit: 100, sort: 'name' });
  const createMutation = useCreatePurchaseRequest();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { warehouseId: '', items: [EMPTY_ITEM], notes: '' },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const warehouseOptions = (warehouses?.items ?? []).map((w) => ({ label: w.name, value: w._id }));
  const productOptions = (products?.items ?? []).map((p) => ({
    label: `${p.name} (${p.sku})`,
    value: p._id,
  }));

  function handleClose() {
    reset({ warehouseId: '', items: [EMPTY_ITEM], notes: '' });
    onClose();
  }

  function onSubmit(values: FormValues) {
    createMutation.mutate(
      {
        warehouseId: values.warehouseId,
        items: values.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          estimatedUnitCost:
            item.estimatedUnitCost === '' || item.estimatedUnitCost === undefined
              ? undefined
              : Number(item.estimatedUnitCost),
          notes: item.notes || undefined,
        })),
        notes: values.notes || undefined,
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Purchase Request" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Select
          label="Warehouse"
          placeholder="Select a warehouse"
          options={warehouseOptions}
          error={errors.warehouseId?.message}
          {...register('warehouseId')}
        />

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Line Items</span>
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="flex flex-col gap-2 rounded-md border border-gray-100 p-3 dark:border-gray-800"
            >
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="Product"
                    placeholder="Select a product"
                    options={productOptions}
                    error={errors.items?.[index]?.productId?.message}
                    {...register(`items.${index}.productId` as const)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fields.length <= 1}
                  onClick={() => remove(index)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Quantity"
                  type="number"
                  min={1}
                  error={errors.items?.[index]?.quantity?.message}
                  {...register(`items.${index}.quantity` as const)}
                />
                <Input
                  label="Estimated Unit Cost (optional)"
                  type="number"
                  min={0}
                  step="0.01"
                  error={errors.items?.[index]?.estimatedUnitCost?.message as string | undefined}
                  {...register(`items.${index}.estimatedUnitCost` as const)}
                />
              </div>
              <Input
                label="Item Notes (optional)"
                {...register(`items.${index}.notes` as const)}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(EMPTY_ITEM)}
          >
            Add Item
          </Button>
        </div>

        <Textarea label="Notes (optional)" rows={2} {...register('notes')} />

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting || createMutation.isPending}>
            Submit Request
          </Button>
        </div>
      </form>
    </Modal>
  );
}
