import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { productApi, type Product } from '../../../../api/catalog.api';
import { listBatches, quickAddStock, warehouseApi, type Batch } from '../../../../api/inventory.api';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Card } from '../../../../components/common/Card';
import { EmptyState } from '../../../../components/common/EmptyState';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { useDebounce } from '../../../../hooks/useDebounce';
import { formatDate } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

/**
 * Prompt (Admin Inventory Management) Part 12-17 — "Add Inventory": select
 * a product, select which of its existing batches to add stock to, enter a
 * quantity, save. Deliberately batch-scoped rather than product-scoped —
 * `Batch` (productId + warehouseId + batchNumber + expiryDate +
 * quantityAvailable) is this codebase's actual unit of stock (Part 26: "do
 * not create a duplicate Product Inventory model"), so "add 5 to this
 * product" always really means "add 5 to one specific batch of it."
 *
 * Prompt (Manufacturer Inventory Model) — KarienLabs manufactures its own
 * stock, so a product with no batches yet is no longer a dead end here: the
 * "Create New Batch" panel below creates the batch AND adds the quantity in
 * one step, with no Purchase Order / GRN involved. It's offered whenever a
 * product is selected — as the only option when it has zero batches, and as
 * a toggle alongside "Add to existing batch" once it has at least one.
 */
export default function AddInventoryPage() {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term, 300);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newMfgDate, setNewMfgDate] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newUnitCost, setNewUnitCost] = useState('');
  const [newMrp, setNewMrp] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newReason, setNewReason] = useState('');
  const queryClient = useQueryClient();

  const { data: productResults, isFetching: searching } = useQuery({
    queryKey: ['admin-products', 'search', debouncedTerm],
    queryFn: () => productApi.list({ search: debouncedTerm, limit: 8 }),
    enabled: debouncedTerm.trim().length >= 2,
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'list', { page: 1, limit: 100 }],
    queryFn: () => warehouseApi.list({ page: 1, limit: 100 }),
  });
  const warehouseNameById = new Map((warehouses?.items ?? []).map((w) => [w._id, w.name]));

  const { data: batchResult, isLoading: loadingBatches } = useQuery({
    queryKey: ['batches', 'by-product', selectedProduct?._id],
    queryFn: () =>
      listBatches({ filter: { productId: selectedProduct!._id }, limit: 100, sort: '-quantityAvailable' }),
    enabled: !!selectedProduct,
  });
  const batches = batchResult?.items ?? [];
  const currentTotalStock = batches.reduce((sum, b) => sum + b.quantityAvailable, 0);
  const selectedBatch = batches.find((b) => b._id === selectedBatchId) ?? null;

  const parsedQuantity = Number(quantity);
  const quantityValid = quantity.trim() !== '' && Number.isInteger(parsedQuantity) && parsedQuantity > 0;

  const addMutation = useMutation({
    mutationFn: () =>
      quickAddStock({
        mode: 'existing_batch',
        batchId: selectedBatchId,
        quantity: parsedQuantity,
        reason: reason || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        `Stock updated — ${result.previousAvailable} + ${parsedQuantity} = ${result.batch.quantityAvailable}`,
      );
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setQuantity('');
      setReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parsedNewQuantity = Number(newQuantity);
  const newQuantityValid =
    newQuantity.trim() !== '' && Number.isInteger(parsedNewQuantity) && parsedNewQuantity > 0;
  const newBatchValid =
    !!newWarehouseId && newBatchNumber.trim() !== '' && newExpiryDate.trim() !== '' && newQuantityValid;

  const newBatchMutation = useMutation({
    mutationFn: () =>
      quickAddStock({
        mode: 'new_batch',
        productId: selectedProduct!._id,
        warehouseId: newWarehouseId,
        batchNumber: newBatchNumber.trim(),
        mfgDate: newMfgDate || undefined,
        expiryDate: newExpiryDate,
        unitCost: newUnitCost.trim() !== '' ? Number(newUnitCost) : undefined,
        mrp: newMrp.trim() !== '' ? Number(newMrp) : undefined,
        quantity: parsedNewQuantity,
        reason: newReason || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        `Batch "${result.batch.batchNumber}" — ${result.previousAvailable} + ${parsedNewQuantity} = ${result.batch.quantityAvailable}`,
      );
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setNewBatchNumber('');
      setNewMfgDate('');
      setNewExpiryDate('');
      setNewUnitCost('');
      setNewMrp('');
      setNewQuantity('');
      setNewReason('');
      setAddMode('existing');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedBatchId('');
    setTerm('');
    setAddMode('existing');
    setNewWarehouseId('');
    setNewBatchNumber('');
    setNewMfgDate('');
    setNewExpiryDate('');
    setNewUnitCost('');
    setNewMrp('');
    setNewQuantity('');
    setNewReason('');
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">Add Inventory</h1>
      <p className="text-sm text-gray-500 dark:text-night-muted">
        Select a product, choose which batch to add stock to, and enter the quantity received.
      </p>

      <Can
        I="update"
        a="inventory"
        fallback={
          <EmptyState
            title="Not authorized"
            description="You do not have permission to add inventory."
          />
        }
      >
        <Card className="flex flex-col gap-4 p-4">
          <div className="relative">
            <Input
              label="Search product/SKU"
              placeholder="e.g. Paracetamol 500mg or SKU-001"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            {debouncedTerm.trim().length >= 2 && term.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-night-border dark:bg-night-surface">
                {searching ? (
                  <div className="p-3 text-sm text-gray-500">Searching…</div>
                ) : !productResults || productResults.items.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No matching products found.</div>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {productResults.items.map((product) => (
                      <li key={product._id}>
                        <button
                          type="button"
                          onClick={() => selectProduct(product)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-night-elevated"
                        >
                          <span>
                            {product.name} <span className="text-gray-400">({product.sku})</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {selectedProduct && (
            <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 dark:border-night-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-night-text">
                    {selectedProduct.name}{' '}
                    <span className="font-mono text-xs text-gray-400">({selectedProduct.sku})</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Current stock (all batches):{' '}
                    <span className="font-semibold text-gray-900 dark:text-night-text">
                      {currentTotalStock}
                    </span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedProduct(null)}>
                  Change product
                </Button>
              </div>

              {loadingBatches ? (
                <SkeletonRows rows={2} columns={2} />
              ) : (
                <>
                  {batches.length === 0 ? (
                    <EmptyState
                      title="No inventory batch exists yet"
                      description="This is manufactured stock — create a batch and add quantity directly below. No Purchase Order / GRN is required."
                    />
                  ) : (
                    <div className="flex gap-4 border-b border-gray-100 pb-2 text-sm dark:border-night-border">
                      <button
                        type="button"
                        onClick={() => setAddMode('existing')}
                        className={
                          addMode === 'existing'
                            ? 'font-medium text-brand-600'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }
                      >
                        Add to existing batch
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddMode('new')}
                        className={
                          addMode === 'new'
                            ? 'font-medium text-brand-600'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }
                      >
                        + Create New Batch
                      </button>
                    </div>
                  )}

                  {batches.length > 0 && addMode === 'existing' && (
                    <>
                      <Select
                        label="Select SKU / Batch"
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        placeholder="Choose a batch"
                        options={batches.map((b: Batch) => ({
                          label: `${b.batchNumber} · ${warehouseNameById.get(b.warehouseId) ?? b.warehouseId} · Exp ${formatDate(b.expiryDate)} · Qty ${b.quantityAvailable}`,
                          value: b._id,
                        }))}
                      />

                      {selectedBatch && (
                        <>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-gray-500">Warehouse</p>
                              <p className="text-sm text-gray-900 dark:text-night-text">
                                {warehouseNameById.get(selectedBatch.warehouseId) ?? selectedBatch.warehouseId}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Current Stock (this batch)</p>
                              <p className="text-sm font-semibold text-gray-900 dark:text-night-text">
                                {selectedBatch.quantityAvailable}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">New Stock</p>
                              <p className="text-sm font-semibold text-brand-600">
                                {quantityValid
                                  ? selectedBatch.quantityAvailable + parsedQuantity
                                  : selectedBatch.quantityAvailable}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input
                              label="Add Quantity"
                              type="number"
                              min={1}
                              step={1}
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              error={
                                quantity.trim() !== '' && !quantityValid
                                  ? 'Enter a positive whole number'
                                  : undefined
                              }
                            />
                            <Input
                              label="Reason / notes (optional)"
                              placeholder="e.g. Fresh stock received"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="gradient"
                              className="w-fit"
                              disabled={!quantityValid}
                              isLoading={addMutation.isPending}
                              onClick={() => addMutation.mutate()}
                            >
                              Add Inventory
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-fit"
                              disabled={addMutation.isPending}
                              onClick={() => {
                                setSelectedBatchId('');
                                setQuantity('');
                                setReason('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {(batches.length === 0 || addMode === 'new') && (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Select
                          label="Warehouse"
                          value={newWarehouseId}
                          onChange={(e) => setNewWarehouseId(e.target.value)}
                          placeholder="Choose a warehouse"
                          options={(warehouses?.items ?? []).map((w) => ({
                            label: `${w.name} (${w.code})`,
                            value: w._id,
                          }))}
                        />
                        <Input
                          label="Batch Number"
                          placeholder="e.g. BATCH-2026-001"
                          value={newBatchNumber}
                          onChange={(e) => setNewBatchNumber(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          label="Manufacturing Date (optional)"
                          type="date"
                          value={newMfgDate}
                          onChange={(e) => setNewMfgDate(e.target.value)}
                        />
                        <Input
                          label="Expiry Date"
                          type="date"
                          value={newExpiryDate}
                          onChange={(e) => setNewExpiryDate(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Input
                          label="Quantity Manufactured"
                          type="number"
                          min={1}
                          step={1}
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                          error={
                            newQuantity.trim() !== '' && !newQuantityValid
                              ? 'Enter a positive whole number'
                              : undefined
                          }
                        />
                        <Input
                          label="Unit Cost (optional)"
                          type="number"
                          min={0}
                          value={newUnitCost}
                          onChange={(e) => setNewUnitCost(e.target.value)}
                        />
                        <Input
                          label="MRP (optional)"
                          type="number"
                          min={0}
                          value={newMrp}
                          onChange={(e) => setNewMrp(e.target.value)}
                        />
                      </div>
                      <Input
                        label="Reason / notes (optional)"
                        placeholder="e.g. Fresh production batch"
                        value={newReason}
                        onChange={(e) => setNewReason(e.target.value)}
                      />

                      <div className="flex gap-2">
                        <Button
                          variant="gradient"
                          className="w-fit"
                          disabled={!newBatchValid}
                          isLoading={newBatchMutation.isPending}
                          onClick={() => newBatchMutation.mutate()}
                        >
                          Create New Batch & Add Stock
                        </Button>
                        {batches.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-fit"
                            disabled={newBatchMutation.isPending}
                            onClick={() => setAddMode('existing')}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      </Can>
    </div>
  );
}
