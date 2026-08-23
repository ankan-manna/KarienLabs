import { shiprocketRequest } from './shiprocket.client';

/**
 * Typed wrappers over Shiprocket's documented REST endpoints (v1 external
 * API). Business logic (order eligibility, idempotency, ownership
 * validation, weight/dimension resolution) lives in
 * modules/orders/shiprocket-fulfillment.service.ts — this file only knows
 * how to shape/parse Shiprocket's own request/response schema.
 */

export interface ShiprocketOrderItem {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string | number;
}

export interface CreateShiprocketOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: ShiprocketOrderItem[];
  payment_method: 'Prepaid' | 'COD';
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface CreateShiprocketOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  onboarding_completed_now?: number;
  awb_code?: string | null;
  courier_company_id?: string | null;
  courier_name?: string | null;
}

export async function createShiprocketOrder(
  payload: CreateShiprocketOrderPayload,
): Promise<CreateShiprocketOrderResponse> {
  return shiprocketRequest<CreateShiprocketOrderResponse>('/orders/create/adhoc', {
    method: 'POST',
    body: payload,
  });
}

export interface AssignAwbResponse {
  awb_assign_status: number;
  response?: {
    data?: {
      awb_code?: string;
      courier_company_id?: number;
      courier_name?: string;
    };
  };
}

/** Omit `courierId` for Shiprocket's automatic/recommended courier selection (Part 17's default). */
export async function assignAwb(shipmentId: string, courierId?: string): Promise<AssignAwbResponse> {
  return shiprocketRequest<AssignAwbResponse>('/courier/assign/awb', {
    method: 'POST',
    body: courierId
      ? { shipment_id: shipmentId, courier_id: courierId }
      : { shipment_id: shipmentId },
  });
}

export interface GeneratePickupResponse {
  pickup_status: number;
  response?: { pickup_scheduled_date?: string; pickup_token_number?: string };
}

export async function requestPickup(shipmentId: string): Promise<GeneratePickupResponse> {
  return shiprocketRequest<GeneratePickupResponse>('/courier/generate/pickup', {
    method: 'POST',
    body: { shipment_id: [shipmentId] },
  });
}

export interface GenerateLabelResponse {
  label_created: number;
  label_url?: string;
}

export async function generateLabel(shipmentId: string): Promise<GenerateLabelResponse> {
  return shiprocketRequest<GenerateLabelResponse>('/courier/generate/label', {
    method: 'POST',
    body: { shipment_id: [shipmentId] },
  });
}

export interface ServiceabilityCourier {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd?: string;
  cod: number;
}

export interface CheckServiceabilityResponse {
  data?: {
    available_courier_companies?: ServiceabilityCourier[];
    recommended_courier_company_id?: number;
  };
}

export async function checkServiceability(params: {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
}): Promise<CheckServiceabilityResponse> {
  const query = new URLSearchParams({
    pickup_postcode: params.pickupPincode,
    delivery_postcode: params.deliveryPincode,
    weight: String(params.weightKg),
    cod: params.cod ? '1' : '0',
  });
  return shiprocketRequest<CheckServiceabilityResponse>(`/courier/serviceability/?${query.toString()}`);
}

export interface TrackByAwbResponse {
  tracking_data?: {
    track_status?: number;
    shipment_status?: string;
    shipment_track?: { current_status?: string; awb_code?: string }[];
    shipment_track_activities?: { date?: string; status?: string; activity?: string; location?: string }[];
  };
}

export async function trackByAwb(awbCode: string): Promise<TrackByAwbResponse> {
  return shiprocketRequest<TrackByAwbResponse>(`/courier/track/awb/${encodeURIComponent(awbCode)}`);
}

/**
 * / SHIP-05 — Shiprocket's dedicated reverse-pickup ("return
 * order") endpoint. Structurally the mirror image of
 * CreateShiprocketOrderPayload: `pickup_*` is where the courier collects the
 * package FROM (the customer's address) and `shipping_*` is where it's
 * delivered TO (the receiving warehouse) — exactly swapped from a forward
 * order, per Part 11/12's "mirroring the forward shipment with addresses
 * swapped." A distinct type/endpoint from CreateShiprocketOrderPayload
 * rather than a boolean flag on it, since the field names themselves differ.
 */
export interface CreateReturnOrderPayload {
  order_id: string;
  order_date: string;
  pickup_customer_name: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  pickup_country: string;
  pickup_pincode: string;
  pickup_email: string;
  pickup_phone: string;
  shipping_customer_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_country: string;
  shipping_pincode: string;
  shipping_email: string;
  shipping_phone: string;
  order_items: ShiprocketOrderItem[];
  payment_method: 'Prepaid';
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export async function createReturnOrder(
  payload: CreateReturnOrderPayload,
): Promise<CreateShiprocketOrderResponse> {
  return shiprocketRequest<CreateShiprocketOrderResponse>('/orders/create/return', {
    method: 'POST',
    body: payload,
  });
}

export interface AddPickupLocationPayload {
  pickup_location: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
}

/** Registers a warehouse as a Shiprocket pickup location (idempotent on Shiprocket's side — re-adding an existing nickname is a no-op/conflict they surface, not a duplicate). */
export async function addPickupLocation(payload: AddPickupLocationPayload): Promise<unknown> {
  return shiprocketRequest('/settings/company/addpickup', { method: 'POST', body: payload });
}

export interface ShiprocketPickupAddress {
  pickup_location: string;
}

interface ListPickupLocationsResponse {
  data?: { shipping_address?: ShiprocketPickupAddress[] | null };
}

/**
 * Bugfix (Order/Shiprocket/Invoice) Part 3 — `addPickupLocation` above
 * existed but was never called anywhere; the app always assumed a pickup
 * location named `SHIPROCKET_PICKUP_LOCATION` already existed on the
 * Shiprocket account. Used by `ensurePickupLocation` in
 * shiprocket-fulfillment.service.ts to check that before trying to create an
 * order against it — Shiprocket's `/orders/create/adhoc` rejects with the
 * generic, misleading "Please add billing/shipping address first" for an
 * unregistered pickup location name, not just a genuinely missing customer
 * address.
 */
export async function listPickupLocations(): Promise<ShiprocketPickupAddress[]> {
  const result = await shiprocketRequest<ListPickupLocationsResponse>('/settings/company/pickup');
  return result.data?.shipping_address ?? [];
}
