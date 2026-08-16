import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface Warehouse {
  _id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  managerId?: string | null;
  capacity?: number | null;
  status?: 'operational' | 'maintenance' | 'closed';
  isActive: boolean;
  // Prompt 11 — Seller/Warehouse relationship.
  sellerId?: string | null;
  gstin?: string;
  stateCode?: string;
  // Prompt 14 — Shiprocket pickup-location contact details.
  contactPhone?: string;
  contactEmail?: string;
}

export const warehouseApi = {
  ...createCrudApi<Warehouse>('/warehouses'),
  /** Dedicated ownership-transfer call — the generic `update()` above can never touch `sellerId` (see warehouse.validator.ts on the backend). */
  async transferSeller(id: string, sellerId: string, reason: string): Promise<Warehouse> {
    const { data } = await httpClient.patch<ApiResponse<Warehouse>>(
      `/warehouses/${id}/transfer-seller`,
      { sellerId, reason },
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
};

export interface Supplier {
  _id: string;
  name: string;
  gstin?: string;
  pan?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  performanceRating?: number | null;
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    accountHolderName?: string;
  };
  isActive: boolean;
}

export const supplierApi = createCrudApi<Supplier>('/suppliers');

export interface PurchaseOrderItem {
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseOrderItem[];
  status: 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';
  createdAt: string;
}

export const purchaseOrderApi = {
  ...createCrudApi<PurchaseOrder>('/purchase-orders'),
  async send(id: string): Promise<PurchaseOrder> {
    const { data } = await httpClient.post<ApiResponse<PurchaseOrder>>(
      `/purchase-orders/${id}/send`,
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
  async cancel(id: string): Promise<PurchaseOrder> {
    const { data } = await httpClient.post<ApiResponse<PurchaseOrder>>(
      `/purchase-orders/${id}/cancel`,
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
};

export interface DamagedStockReport {
  _id: string;
  batchId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  reportedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export const damagedStockApi = {
  ...createCrudApi<DamagedStockReport>('/damaged-stock'),
  async approve(id: string): Promise<DamagedStockReport> {
    const { data } = await httpClient.post<ApiResponse<DamagedStockReport>>(
      `/damaged-stock/${id}/approve`,
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
};

export interface StockTransfer {
  _id: string;
  batchId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  status: 'pending' | 'in_transit' | 'received' | 'cancelled';
  requestedBy: string;
  receivedBy: string | null;
  receivedAt: string | null;
  createdAt: string;
}

export const stockTransferApi = {
  ...createCrudApi<StockTransfer>('/stock-transfers'),
  async receive(id: string): Promise<StockTransfer> {
    const { data } = await httpClient.post<ApiResponse<StockTransfer>>(
      `/stock-transfers/${id}/receive`,
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
  async cancel(id: string): Promise<StockTransfer> {
    const { data } = await httpClient.post<ApiResponse<StockTransfer>>(
      `/stock-transfers/${id}/cancel`,
    );
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
};

export interface StockMovement {
  _id: string;
  batchId: string;
  warehouseId: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  referenceType: string | null;
  notes: string;
  createdAt: string;
}

export async function listStockMovements(params: {
  page?: number;
  limit?: number;
}): Promise<{ items: StockMovement[]; meta: { total: number } }> {
  const { data } = await httpClient.get<ApiResponse<StockMovement[]>>('/stock-movements', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as { total: number } };
}

export interface LowStockItem {
  productId: string;
  warehouseId: string;
  productName: string;
  sku: string;
  totalAvailable: number;
  reorderLevel: number;
}

export type BatchStatus = 'active' | 'expired' | 'flagged' | 'exhausted';

export const BATCH_STATUS_OPTIONS: { label: string; value: BatchStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Exhausted', value: 'exhausted' },
];

export interface NearExpiryBatch {
  _id: string;
  batchNumber: string;
  expiryDate: string;
  quantityAvailable: number;
  productId: string;
  effectiveStatus: BatchStatus;
}

export interface Batch {
  _id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  batchNumber: string;
  mfgDate: string | null;
  expiryDate: string;
  quantityReceived: number;
  quantityAvailable: number;
  unitCost: number;
  supplierId: string | null;
  purchaseOrderId: string | null;
  status: BatchStatus;
  effectiveStatus?: BatchStatus;
  // Prompt 12 (CAT-04) — batch-specific MRP override + recall flag.
  mrp?: number | null;
  recallFlag?: boolean;
  /** batch.mrp ?? product.mrp, precomputed server-side — see batch-pricing.util.ts. */
  effectiveMrp?: number | null;
}

export async function fetchLowStockReport(): Promise<LowStockItem[]> {
  const { data } = await httpClient.get<ApiResponse<LowStockItem[]>>('/batches/reports/low-stock');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function fetchNearExpiryReport(days = 30): Promise<NearExpiryBatch[]> {
  const { data } = await httpClient.get<ApiResponse<NearExpiryBatch[]>>(
    '/batches/reports/near-expiry',
    {
      params: { days },
    },
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function listBatches(
  params: ListQueryParams = {},
): Promise<{ items: Batch[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Batch[]>>('/batches', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getBatch(id: string): Promise<Batch & { effectiveStatus: BatchStatus }> {
  const { data } = await httpClient.get<ApiResponse<Batch & { effectiveStatus: BatchStatus }>>(
    `/batches/${id}`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function updateBatchStatus(id: string, status: BatchStatus): Promise<Batch> {
  const { data } = await httpClient.patch<ApiResponse<Batch>>(`/batches/${id}/status`, {
    status,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** CAT-04 — `mrp: null` clears the override back to "use Product.mrp". */
export async function updateBatchMrp(id: string, mrp: number | null): Promise<Batch> {
  const { data } = await httpClient.patch<ApiResponse<Batch>>(`/batches/${id}/mrp`, { mrp });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function setBatchRecallFlag(
  id: string,
  recallFlag: boolean,
  reason?: string,
): Promise<Batch> {
  const { data } = await httpClient.patch<ApiResponse<Batch>>(`/batches/${id}/recall`, {
    recallFlag,
    reason,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface StockAdjustment {
  _id: string;
  batchId: string;
  warehouseId: string;
  quantityDelta: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export type QuickAddStockInput =
  | { mode: 'existing_batch'; batchId: string; quantity: number; reason?: string }
  | {
      mode: 'new_batch';
      productId: string;
      warehouseId: string;
      variantId?: string | null;
      batchNumber: string;
      mfgDate?: string;
      expiryDate: string;
      unitCost?: number;
      mrp?: number;
      quantity: number;
      reason?: string;
    };

/**
 * Admin Inventory Management — single-step "Add Inventory". `existing_batch`
 * adds quantity to a batch that's already there; `new_batch` is the
 * PO/GRN-free manufacturer path (Manufacturer Inventory Model prompt) that
 * creates the batch AND adds the quantity in one call. Backed by the same
 * `POST /stock-adjustments/quick-add` endpoint — no duplicate API surface.
 */
export async function quickAddStock(
  input: QuickAddStockInput,
): Promise<{ batch: Batch; adjustment: StockAdjustment; previousAvailable: number }> {
  const { data } = await httpClient.post<
    ApiResponse<{ batch: Batch; adjustment: StockAdjustment; previousAvailable: number }>
  >('/stock-adjustments/quick-add', input);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
