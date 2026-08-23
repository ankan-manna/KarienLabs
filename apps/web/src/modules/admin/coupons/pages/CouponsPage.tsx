import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { Coupon } from '../../../../api/coupons.api';
import { couponApi, getCouponAnalytics, toggleCoupon } from '../../../../api/coupons.api';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Card } from '../../../../components/common/Card';
import { Checkbox } from '../../../../components/common/Checkbox';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { MultiSelect } from '../../../../components/common/MultiSelect';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Switch } from '../../../../components/common/Switch';
import { DataTable } from '../../../../components/table/DataTable';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';
import { useDebounce } from '../../../../hooks/useDebounce';
import { formatCurrency } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';
import { couponFormSchema, type CouponFormValues } from '../../../../validators/coupon.validators';
import { categoryHooks } from '../../catalog/hooks/useCategories';
import { productHooks } from '../../catalog/hooks/useProducts';
import { sellerHooks } from '../../sellers/hooks/useSellers';

const couponHooks = createCrudHooks('coupons', couponApi);

function CouponAnalyticsSummary({ couponId }: { couponId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coupon-analytics', couponId],
    queryFn: () => getCouponAnalytics(couponId),
  });

  if (isLoading || !data) return <Skeleton className="mb-4 h-16 w-full" />;

  return (
    <Card className="mb-4 grid grid-cols-3 gap-2 p-3 text-center text-sm">
      <div>
        <p className="text-xs text-gray-500">Used</p>
        <p className="font-semibold">
          {data.usageCount}
          {data.usageLimitGlobal != null ? ` / ${data.usageLimitGlobal}` : ''}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Orders</p>
        <p className="font-semibold">{data.orderCount}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Discount Given</p>
        <p className="font-semibold">{formatCurrency(data.totalDiscountGiven)}</p>
      </div>
    </Card>
  );
}

function ActiveToggleCell({ coupon }: { coupon: Coupon }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (isActive: boolean) => toggleCoupon(coupon._id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons', 'list'] });
      toast.success('Coupon status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={coupon.isActive} onChange={(checked) => mutation.mutate(checked)} disabled={mutation.isPending} />
    </div>
  );
}

const columns: ColumnDef<Coupon, unknown>[] = [
  { accessorKey: 'code', header: 'Code' },
  {
    accessorKey: 'value',
    header: 'Discount',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.type === 'percentage' ? `${row.original.value}%` : `₹${row.original.value}`,
  },
  { accessorKey: 'usageCount', header: 'Used', enableSorting: false },
  {
    accessorKey: 'isActive',
    header: 'Active',
    enableSorting: false,
    cell: ({ row }) => <ActiveToggleCell coupon={row.original} />,
  },
];

export default function CouponsPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const limit = 20;

  const { data, isLoading } = couponHooks.useList({ page, limit });
  const createMutation = couponHooks.useCreate();
  const updateMutation = couponHooks.useUpdate();
  const removeMutation = couponHooks.useRemove();

  // Scoping pickers ( 19 fields the form never exposed) — each product
  // picker gets its own search-as-you-type state since "applicable" and
  // "excluded" are independent searches over the same product list endpoint.
  const [productSearch, setProductSearch] = useState('');
  const [excludedProductSearch, setExcludedProductSearch] = useState('');
  const debouncedProductSearch = useDebounce(productSearch, 300);
  const debouncedExcludedProductSearch = useDebounce(excludedProductSearch, 300);

  const { data: productsResult, isFetching: isProductsFetching } = productHooks.useList({
    page: 1,
    limit: 20,
    search: debouncedProductSearch || undefined,
  });
  const { data: excludedProductsResult, isFetching: isExcludedProductsFetching } = productHooks.useList({
    page: 1,
    limit: 20,
    search: debouncedExcludedProductSearch || undefined,
  });
  const { data: categoriesResult } = categoryHooks.useList({ page: 1, limit: 100 });
  const { data: sellersResult } = sellerHooks.useList({ page: 1, limit: 100 });

  const productOptions = (productsResult?.items ?? []).map((p) => ({ label: `${p.name} (${p.sku})`, value: p._id }));
  const excludedProductOptions = (excludedProductsResult?.items ?? []).map((p) => ({
    label: `${p.name} (${p.sku})`,
    value: p._id,
  }));
  const categoryOptions = (categoriesResult?.items ?? []).map((c) => ({ label: c.name, value: c._id }));
  const sellerOptions = (sellersResult?.items ?? []).map((s) => ({ label: s.legalName, value: s._id }));

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: { type: 'percentage' },
  });

  const applicableProductIds = watch('applicableProductIds') ?? [];
  const applicableCategoryIds = watch('applicableCategoryIds') ?? [];
  const excludedProductIds = watch('excludedProductIds') ?? [];
  const sellerId = watch('sellerId') ?? '';

  useEffect(() => {
    setProductSearch('');
    setExcludedProductSearch('');
    if (editing) {
      reset({
        code: editing.code,
        description: editing.description,
        type: editing.type,
        value: editing.value,
        maxDiscountAmount: editing.maxDiscountAmount ?? undefined,
        minCartValue: editing.minCartValue,
        usageLimitGlobal: editing.usageLimitGlobal ?? undefined,
        usageLimitPerUser: editing.usageLimitPerUser,
        firstOrderOnly: editing.firstOrderOnly,
        priority: editing.priority,
        sellerId: editing.sellerId,
        applicableProductIds: editing.applicableProductIds,
        applicableCategoryIds: editing.applicableCategoryIds,
        applicableUserIds: editing.applicableUserIds,
        excludedProductIds: editing.excludedProductIds,
        validFrom: editing.validFrom.slice(0, 10),
        validTo: editing.validTo.slice(0, 10),
        isActive: editing.isActive,
      });
    } else {
      reset({
        code: '',
        type: 'percentage',
        value: 0,
        validFrom: '',
        validTo: '',
        isActive: true,
        sellerId: null,
        applicableProductIds: [],
        applicableCategoryIds: [],
        excludedProductIds: [],
      });
    }
  }, [editing, reset]);

  async function onSubmit(values: CouponFormValues) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing._id, input: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    setIsFormOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coupons</h1>
        <Can I="create" a="coupons">
          <Button
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            New Coupon
          </Button>
        </Can>
      </div>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(row) => {
          setEditing(row);
          setIsFormOpen(true);
        }}
      />

      <Drawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Edit Coupon' : 'New Coupon'}
      >
        {editing && <CouponAnalyticsSummary couponId={editing._id} />}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input label="Code" error={errors.code?.message} {...register('code')} />
          <Select
            label="Type"
            options={[
              { label: 'Percentage', value: 'percentage' },
              { label: 'Flat amount', value: 'flat' },
            ]}
            {...register('type')}
          />
          <Input label="Value" type="number" error={errors.value?.message} {...register('value')} />
          <Input
            label="Maximum discount (percentage coupons)"
            type="number"
            error={errors.maxDiscountAmount?.message}
            {...register('maxDiscountAmount')}
          />
          <Input
            label="Minimum cart value"
            type="number"
            error={errors.minCartValue?.message}
            {...register('minCartValue')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Global usage limit"
              type="number"
              error={errors.usageLimitGlobal?.message}
              {...register('usageLimitGlobal')}
            />
            <Input
              label="Usage limit per user"
              type="number"
              error={errors.usageLimitPerUser?.message}
              {...register('usageLimitPerUser')}
            />
          </div>
          <Input
            label="Priority (higher shows first)"
            type="number"
            error={errors.priority?.message}
            {...register('priority')}
          />

          <Select
            label="Seller scope"
            placeholder="Platform-wide (all sellers)"
            options={sellerOptions}
            value={sellerId ?? ''}
            onChange={(e) => setValue('sellerId', e.target.value || null, { shouldDirty: true })}
          />

          <MultiSelect
            label="Applicable products (empty = all products)"
            placeholder="Search products by name or SKU…"
            options={productOptions}
            value={applicableProductIds}
            onChange={(ids) => setValue('applicableProductIds', ids, { shouldDirty: true })}
            searchValue={productSearch}
            onSearchChange={setProductSearch}
            isLoading={isProductsFetching}
            error={errors.applicableProductIds?.message as string | undefined}
          />

          <MultiSelect
            label="Applicable categories (empty = all categories)"
            placeholder="Filter categories…"
            options={categoryOptions}
            value={applicableCategoryIds}
            onChange={(ids) => setValue('applicableCategoryIds', ids, { shouldDirty: true })}
            error={errors.applicableCategoryIds?.message as string | undefined}
          />

          <MultiSelect
            label="Excluded products"
            placeholder="Search products to exclude…"
            hint="Takes precedence over the applicable products/categories above."
            options={excludedProductOptions}
            value={excludedProductIds}
            onChange={(ids) => setValue('excludedProductIds', ids, { shouldDirty: true })}
            searchValue={excludedProductSearch}
            onSearchChange={setExcludedProductSearch}
            isLoading={isExcludedProductsFetching}
            error={errors.excludedProductIds?.message as string | undefined}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valid from"
              type="date"
              error={errors.validFrom?.message}
              {...register('validFrom')}
            />
            <Input
              label="Valid to"
              type="date"
              error={errors.validTo?.message}
              {...register('validTo')}
            />
          </div>
          <Checkbox label="First order only" {...register('firstOrderOnly')} />
          <Checkbox label="Active" {...register('isActive')} />
          <div className="mt-2 flex justify-between gap-2">
            {editing && (
              <Can I="delete" a="coupons">
                <Button type="button" variant="danger" onClick={() => setDeleting(editing)}>
                  Delete
                </Button>
              </Can>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                {editing ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete coupon"
        message={`Delete "${deleting?.code}"? This can't be undone.`}
        confirmLabel="Delete"
        isDangerous
        isLoading={removeMutation.isPending}
        onConfirm={async () => {
          if (deleting) await removeMutation.mutateAsync(deleting._id);
          setDeleting(null);
          setIsFormOpen(false);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
