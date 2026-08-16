import { zodResolver } from '@hookform/resolvers/zod';
import type { Action, Resource } from '@medcommerce/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { createCrudHooks } from '../../hooks/createCrudHooks';
import {
  nameSlugFormSchema,
  type NameSlugFormValues,
} from '../../validators/simple-crud.validators';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Can } from '../common/Can';
import { Checkbox } from '../common/Checkbox';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Drawer } from '../common/Drawer';
import { Input } from '../common/Input';
import { SearchBar } from '../common/SearchBar';

import { DataTable } from './DataTable';

interface NameEntity {
  _id: string;
  name: string;
  isActive: boolean;
}

interface SimpleEntityPageProps<T extends NameEntity> {
  title: string;
  resource: Resource;
  hooks: ReturnType<typeof createCrudHooks<T, Partial<T>, Partial<T>>>;
  extraColumns?: ColumnDef<T, unknown>[];
}

/** Reused by every "name + isActive" shaped admin module (Category, Warehouse, ...) — same table+drawer+form pattern as ProductsPage, generalized. */
export function SimpleEntityPage<T extends NameEntity>({
  title,
  resource,
  hooks,
  extraColumns = [],
}: SimpleEntityPageProps<T>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const limit = 20;

  const { data, isLoading } = hooks.useList({ page, limit, search: search || undefined });
  const createMutation = hooks.useCreate();
  const updateMutation = hooks.useUpdate();
  const removeMutation = hooks.useRemove();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NameSlugFormValues>({ resolver: zodResolver(nameSlugFormSchema) });

  useEffect(() => {
    reset(
      editing ? { name: editing.name, isActive: editing.isActive } : { name: '', isActive: true },
    );
  }, [editing, reset]);

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function onSubmit(values: NameSlugFormValues) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing._id, input: values as Partial<T> });
    } else {
      await createMutation.mutateAsync(values as Partial<T>);
    }
    setIsFormOpen(false);
  }

  const columns: ColumnDef<T, unknown>[] = [
    { accessorKey: 'name', header: 'Name' },
    ...extraColumns,
    {
      accessorKey: 'isActive',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone={row.original.isActive ? 'green' : 'gray'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <Can I="create" a={resource}>
          <Button onClick={openCreate}>New</Button>
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
        toolbar={
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={`Search ${title.toLowerCase()}…`}
          />
        }
      />

      <Drawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${title}` : `New ${title}`}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <Checkbox label="Active" {...register('isActive')} />
          <div className="mt-2 flex justify-between gap-2">
            {editing && (
              <Can I={'delete' as Action} a={resource}>
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
        title={`Delete ${title.slice(0, -1)}`}
        message={`Delete "${deleting?.name}"? This can't be undone.`}
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
