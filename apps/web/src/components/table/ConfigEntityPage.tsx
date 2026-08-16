import { zodResolver } from '@hookform/resolvers/zod';
import type { Action, Resource } from '@medcommerce/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState, type ReactNode } from 'react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { z, type ZodTypeAny } from 'zod';

import type { createCrudHooks } from '../../hooks/createCrudHooks';
import { downloadBlob } from '../../utils/downloadBlob';
import { toast } from '../../utils/toast';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Can } from '../common/Can';
import { Checkbox } from '../common/Checkbox';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EntityDrawer } from '../common/EntityDrawer';
import { Input } from '../common/Input';
import { SearchBar } from '../common/SearchBar';
import { Select } from '../common/Select';
import { Textarea } from '../common/Textarea';

import { BulkActionsBar } from './BulkActionsBar';
import { DataTable } from './DataTable';
import { EntityToolbar } from './EntityToolbar';
import { SavedFilters } from './SavedFilters';
import { selectionColumn } from './selectionColumn';

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select';
  options?: { label: string; value: string }[];
  required?: boolean;
  optional?: boolean;
  defaultValue?: unknown;
  /** Show this field as its own table column (in addition to the first field + isActive, which are always shown). */
  showInTable?: boolean;
  /** Custom table cell formatter, e.g. for currency or enum labels. */
  formatCell?: (value: unknown) => string;
}

interface BaseEntity {
  _id: string;
  isActive?: boolean;
}

interface ConfigEntityPageProps<T extends BaseEntity> {
  title: string;
  resource: Resource;
  hooks: ReturnType<typeof createCrudHooks<T, Record<string, unknown>, Record<string, unknown>>>;
  fields: ConfigField[];
  api: {
    exportExcel?: () => Promise<Blob>;
    importExcel?: (file: File) => Promise<{ inserted: number; failed: { row: number; error: string }[] }>;
  };
  hasActiveToggle?: boolean;
  /** Optional "Related Information" drawer tab (e.g. Seller's Warehouses/Order/Invoice summary) — only rendered once an existing record is open (never for "New"). Purely additive; entities that don't pass this keep the exact same 4-tab drawer they had before. */
  renderRelated?: (entity: T) => ReactNode;
  /** Optional "Preview" drawer tab (e.g. Notification Templates' rendered subject/body). Same convention as `renderRelated` — additive, only shown for existing records. */
  renderPreview?: (entity: T) => ReactNode;
  /**
   * Escape hatch for fields the flat `ConfigField[]` model can't express —
   * nested objects (e.g. Category/Product's `seo: {metaTitle, ...}`) or
   * repeatable arrays (e.g. Category's `faq: [{question, answer}]`).
   * Rendered inside the SAME form as the declarative `fields` above (the
   * form is wrapped in a react-hook-form `FormProvider`, so this callback
   * can call `useFormContext()` and `register('seo.metaTitle')` /
   * `useFieldArray({ name: 'faq' })` directly — react-hook-form natively
   * reads/writes dot-path field names as nested objects on both
   * `reset()`/defaultValues and the submitted `values`, so no manual
   * flatten/unflatten bookkeeping is needed here). Purely additive and
   * opt-in: entities that don't pass this render nothing extra and are
   * completely unaffected.
   */
  renderExtraFields?: () => ReactNode;
  /**
   * Companion to `renderExtraFields` — supplies the nested/array
   * defaultValues (e.g. `{ seo: {...}, faq: [...] }`) the extra fields
   * above should seed from, since those keys aren't in the declarative
   * `fields` list and so aren't picked up by the normal per-field reset
   * loop. Called with `null` when opening the "New" form.
   */
  extraDefaultValues?: (entity: T | null) => Record<string, unknown>;
}

function fieldToZod(field: ConfigField): ZodTypeAny {
  const isOptional = field.optional || field.required === false;
  let schema: ZodTypeAny;
  switch (field.type) {
    case 'number':
      schema = z.coerce.number();
      break;
    case 'boolean':
      schema = z.boolean().default(true);
      break;
    default:
      // Optional text/select fields must not enforce `min(1)` — react-hook-form's
      // default value for an untouched optional field is `''`, not `undefined`, so a
      // `.min(1).optional()` chain would still reject a deliberately-empty optional
      // field (e.g. "no parent" / "no icon") with a spurious "is required" error.
      schema = isOptional
        ? z.string().trim()
        : z.string().trim().min(1, `${field.label} is required`);
  }
  if (isOptional) schema = schema.optional();
  return schema;
}

/**
 * Field-config-driven CRUD page — the frontend counterpart to the backend's
 * `createCrudRouter` factory. Powers every simple config-style admin module
 * (delivery partners, shipping zones/rules, GST settings, CMS content,
 * notification templates, ...) from one component + a per-module field list,
 * instead of a hand-written page each. Modules with real business-process UI
 * (Products, Orders, stock workflows) keep bespoke pages.
 */
export function ConfigEntityPage<T extends BaseEntity>({
  title,
  resource,
  hooks,
  fields,
  api,
  hasActiveToggle = true,
  renderRelated,
  renderPreview,
  renderExtraFields,
  extraDefaultValues,
}: ConfigEntityPageProps<T>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const limit = 20;

  const { data, isLoading, refetch } = hooks.useList({ page, limit, search: search || undefined });
  const createMutation = hooks.useCreate();
  const updateMutation = hooks.useUpdate();
  const removeMutation = hooks.useRemove();
  const bulkDeleteMutation = hooks.useBulkDelete();
  const bulkEditMutation = hooks.useBulkEdit();

  const schemaShape: Record<string, ZodTypeAny> = {};
  for (const f of fields) schemaShape[f.name] = fieldToZod(f);
  if (hasActiveToggle) schemaShape.isActive = z.boolean().optional();
  // `.passthrough()` (rather than the default "strip unknown keys") so any
  // extra nested/array field `renderExtraFields` registers (e.g.
  // `seo.metaTitle`, `faq`) survives into the submitted `values` instead of
  // being silently discarded by the resolver — those fields aren't part of
  // `schemaShape` since they're not in the declarative `fields` list. Every
  // field IN `schemaShape` is still validated exactly as before; this only
  // stops DROPPING keys the schema doesn't know about, which previously
  // never mattered because no consumer ever submitted any.
  const formSchema = z.object(schemaShape).passthrough();

  const form: UseFormReturn<Record<string, unknown>> = useForm<Record<string, unknown>>({
    resolver: zodResolver(formSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (editing) {
      const editingBag = editing as unknown as Record<string, unknown>;
      const values: Record<string, unknown> = {
        isActive: editing.isActive ?? true,
        ...extraDefaultValues?.(editing),
      };
      for (const f of fields) values[f.name] = editingBag[f.name] ?? f.defaultValue ?? '';
      reset(values);
    } else {
      const values: Record<string, unknown> = { isActive: true, ...extraDefaultValues?.(null) };
      for (const f of fields) values[f.name] = f.defaultValue ?? (f.type === 'boolean' ? true : '');
      reset(values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, fields, reset]);

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function onSubmit(values: Record<string, unknown>) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing._id, input: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    setIsFormOpen(false);
  }

  const tableFields = fields.filter((f) => f.showInTable !== false).slice(0, 4);
  const columns: ColumnDef<T, unknown>[] = [
    selectionColumn<T>(),
    ...tableFields.map(
      (f): ColumnDef<T, unknown> => ({
        accessorKey: f.name,
        header: f.label,
        cell: ({ row }) => {
          const raw = (row.original as unknown as Record<string, unknown>)[f.name];
          if (f.formatCell) return f.formatCell(raw);
          if (f.type === 'boolean') return raw ? 'Yes' : 'No';
          return String(raw ?? '—');
        },
      }),
    ),
    ...(hasActiveToggle
      ? [
          {
            accessorKey: 'isActive',
            header: 'Status',
            enableSorting: false,
            cell: ({ row }: { row: { original: T } }) => (
              <Badge tone={row.original.isActive ? 'green' : 'gray'}>
                {row.original.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          } as ColumnDef<T, unknown>,
        ]
      : []),
  ];

  async function handleExportExcel() {
    if (!api.exportExcel) throw new Error('Export not supported');
    return api.exportExcel();
  }

  async function handleImportExcel(file: File) {
    if (!api.importExcel) throw new Error('Import not supported');
    const result = await api.importExcel(file);
    if (result.failed.length > 0) {
      toast.info(`Imported ${result.inserted} row(s), ${result.failed.length} failed — see console for details`);
      // eslint-disable-next-line no-console
      console.warn(`${title} import failures`, result.failed);
    }
    await refetch();
  }

  function handleExportCsv() {
    const rows = data?.items ?? [];
    const headers = ['_id', ...tableFields.map((f) => f.name), ...(hasActiveToggle ? ['isActive'] : [])];
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? '')).join(',')),
    ].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${title}-${Date.now()}.csv`);
  }

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
        totalCount={data?.meta?.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        enableRowSelection
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(row) => {
          setEditing(row);
          setIsFormOpen(true);
        }}
        bulkActions={
          <BulkActionsBar
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds(new Set())}
            onDelete={(ids) => bulkDeleteMutation.mutateAsync(ids)}
            onSetActive={
              hasActiveToggle
                ? (ids, isActive) => bulkEditMutation.mutateAsync({ ids, patch: { isActive } })
                : undefined
            }
            isDeleting={bulkDeleteMutation.isPending}
            isUpdating={bulkEditMutation.isPending}
          />
        }
        toolbar={
          <EntityToolbar
            onRefresh={() => refetch()}
            onExportExcel={api.exportExcel ? handleExportExcel : undefined}
            onExportCsv={handleExportCsv}
            onImportExcel={api.importExcel ? handleImportExcel : undefined}
            exportFilenamePrefix={title}
          >
            <SearchBar value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}…`} />
            <SavedFilters storageKey={`${resource}-saved-filters`} currentSearch={search} onApply={setSearch} />
          </EntityToolbar>
        }
      />

      <EntityDrawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${title}` : `New ${title}`}
        resource={resource}
        resourceId={editing?._id ?? null}
        related={editing && renderRelated ? renderRelated(editing) : undefined}
        preview={editing && renderPreview ? renderPreview(editing) : undefined}
        general={
        <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {fields.map((f) => {
            const error = (errors[f.name]?.message as string | undefined) ?? undefined;
            if (f.type === 'boolean') {
              return <Checkbox key={f.name} label={f.label} {...register(f.name)} />;
            }
            if (f.type === 'textarea') {
              return <Textarea key={f.name} label={f.label} error={error} {...register(f.name)} />;
            }
            if (f.type === 'select') {
              return (
                <Select
                  key={f.name}
                  label={f.label}
                  error={error}
                  options={f.options ?? []}
                  {...register(f.name)}
                />
              );
            }
            return (
              <Input
                key={f.name}
                type={f.type === 'number' ? 'number' : 'text'}
                label={f.label}
                error={error}
                {...register(f.name)}
              />
            );
          })}
          {hasActiveToggle && <Checkbox label="Active" {...register('isActive')} />}

          {renderExtraFields?.()}

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
        </FormProvider>
        }
      />

      <ConfirmDialog
        isOpen={!!deleting}
        title={`Delete ${title}`}
        message={`Delete this record? This can't be undone.`}
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
