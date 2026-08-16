# Karien Labs Medical Ecommerce — Development Tasks

Master checklist for remaining work, derived from the project audit. Only missing or partially implemented items are listed; fully implemented features are excluded. See the **Appendix** at the bottom for the full audit reference tables (module status, database gap, business logic gap, Shiprocket/Razorpay audit, client requirement checklist, branding checklist).

---

## Quick Reference — Database Field Changes Needed

| Model | Field(s) | Type | Change | Why |
|---|---|---|---|---|
| `seller` (new collection) | `legalName`, `gstin`, `drugLicenseNumber`, `enabled` | String, String, String, Boolean | New collection | Client requires 2–3 sellers as distinct legal entities; none exists today |
| `warehouse` | `gstin` | String | Add | Needed to compare against shipping-address state for CGST/SGST vs IGST |
| `warehouse` | `stateCode` | String | Add (or reuse existing address field) | Same as above |
| `warehouse` | `sellerId` | ObjectId ref `seller` | Add | Associates a warehouse to its owning seller |
| `product` | `weightGrams` | Number | Add | Mandatory field for Shiprocket create-order API |
| `product` | `lengthMm`, `widthMm`, `heightMm` | Number | Add | Mandatory dimension fields for Shiprocket create-order API |
| `product` | `barcode` | String | Add | Warehouse scanning + Shiprocket manifest |
| `product.medicine` | `coldStorage` | Boolean | Add | Cold-chain handling flag, not currently modeled |
| `category` | `isExpirableDefault` | Boolean | Add | Category-level default so SKUs can inherit instead of always requiring a manual flag |
| `category` | `requiresPrescriptionDefault` | Boolean | Add | Same pattern for prescription requirement |
| `batch` | `mrp` | Number (optional) | Add | Per-batch MRP override — real pharma packs can print a different MRP per batch |
| `batch` | `recallFlag` | Boolean | Add | Batch-level recall tracking, used for recall traceability |
| `invoice` | `roundOff` | Number | Add | `grandTotal − sum(line items)`, currently no reconciliation line exists |
| `invoice_item` / order line | `sellerId` | ObjectId ref `seller` | Add | So invoice numbering/sequence can be scoped per seller |
| `shipment` | `awbCode` | String | Add | AWB/tracking number returned by Shiprocket (distinct from the existing generic `trackingNumber` staff-entry field) |
| `shipment` | `courierName` | String | Add | Returned by Shiprocket at AWB assignment |
| `shipment` | `labelUrl` | String | Add | Shipping label URL fetched from Shiprocket — field does not exist today |
| `shipment` | `shiprocketOrderId`, `shiprocketShipmentId` | String, String | Add | Two plain reference columns are sufficient (per business-logic reference §16) — no generic EAV mapping table needed |
| `order` | (status transitions only, no new field) | — | Modify `ORDER_STATUS_TRANSITIONS` | Cancellation must stop being allowed once status passes `confirmed` |
| `return` | `qcResult` | Enum: `SELLABLE` / `DAMAGED` / `EXPIRED` / `TAMPERED` | Add | Structured QC outcome, currently only a general status enum exists — needed to auto-decide restock vs write-off and to route refund vs replacement |
| `return` | `returnReasonWindowDays` (or reason-keyed lookup, not necessarily a DB field — may be a config constant) | — | Add reason-based window logic | Damaged/missing needs 2-day window, wrong/expired/defective needs 7-day window; currently one flat constant |
| `bundle` (new collection) | `productId` (own sellable SKU), `sellingPrice` | ObjectId, Number | New collection | Bundle is its own priced SKU, not auto-summed from components |
| `bundle_item` (new collection) | `bundleId`, `componentProductId`, `quantity`, `priceRatio` | ObjectId, ObjectId, Number, Number | New collection | `priceRatio` apportions the bundle's actual charged price across components for GST only — never used to derive the charged price |
| `order` | `prescriptionVerified` | Boolean (field already exists) | **No schema change — wire enforcement logic** | Field exists but is never read; needs to actually gate fulfillment |
| `order_activity` (new collection) | `orderId`, `actorType`, `actorId`, `actionCode`, `description`, `createdAt`, `requestId` | ObjectId ref `order`, Enum(`EMPLOYEE`/`CUSTOMER`/`SYSTEM`), ObjectId (nullable), String, String, Date, String (nullable) | New collection | Order-specific activity timeline with a real FK to the order — a generic `AuditLog` mechanism already exists for other resources (config/role/admin-user/purchase-order/GRN/return/refund) and is left untouched; this is a small, dedicated, order-scoped addition, not a redesign of that existing mechanism |

---

# Phase 1 - Critical Backend

## CAT-01 Add Seller Entity

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Introduce a `seller` collection representing each of the client's 2–3 sellers as a distinct legal/business entity. Fields: `legalName` (String), `gstin` (String), `drugLicenseNumber` (String), `enabled` (Boolean). Associate `warehouse.sellerId` and order/invoice records to a seller.

Reason:
The client requires 2–3 sellers; the platform is currently single-tenant with no concept of a seller distinct from the platform admin.

Dependencies:
None

Acceptance Criteria

- [ ] `seller` collection created with `legalName`, `gstin`, `drugLicenseNumber`, `enabled`
- [ ] `warehouse.sellerId` field added, referencing `seller`
- [ ] Order/Invoice carry a `sellerId` for correct invoice numbering and tax-entity attribution

----------------------------------------------------

## AUTH-01 Add Seller Role, Login, and Dashboard

Status:
❌ Missing

Priority:
Medium

Complexity:
Medium

Description:
Add a `seller` role distinct from `admin`/`inventory_manager`, allowing a seller to log in and view a scoped dashboard limited to their own warehouse(s), orders, and inventory.

Reason:
The current `ROLES` list is only `super_admin`, `admin`, `inventory_manager`, `customer` — there is no seller login or dashboard at all, only an (upcoming) admin-managed `seller` data record. A true seller self-service login is a separate concern from the seller entity itself.

Dependencies:
CAT-01

Acceptance Criteria

- [ ] `seller` role added to the roles/permissions system
- [ ] Seller can log in and see only their own seller's data (orders, inventory, warehouses)
- [ ] Seller dashboard scoped/filtered by `sellerId`

----------------------------------------------------

## CAT-02 Add Warehouse GSTIN and State

Status:
🟡 Partial

Priority:
High

Complexity:
Small

Description:
Add `gstin` (String) and `stateCode` (String) fields to the Warehouse model so the correct tax entity and state can be determined at invoice time.

Reason:
Required to compute CGST/SGST vs IGST correctly — currently impossible since the warehouse has no GSTIN/state to compare against the shipping address.

Dependencies:
None

Acceptance Criteria

- [ ] `warehouse.gstin` field added
- [ ] `warehouse.stateCode` field added (or reused from existing address field if present)
- [ ] Field is required and validated on warehouse create/update

----------------------------------------------------

## TAX-01 State-based CGST/SGST vs IGST Split

Status:
🟡 Partial

Priority:
High

Complexity:
Medium

Description:
Compare the warehouse's `stateCode` to the customer's shipping-address state at invoice generation time. Same state → CGST+SGST (each = total rate / 2); different state → IGST (= total rate).

Reason:
Currently hardcoded to a flat 50/50 CGST/SGST split with IGST always zero (`invoice.service.ts`: `cgst = totals.gst / 2; sgst = totals.gst - cgst; igst: 0`), regardless of actual states — this produces incorrect tax invoices for any inter-state order.

Dependencies:
CAT-02

Acceptance Criteria

- [ ] Invoice generation compares `warehouse.stateCode` to shipping address state
- [ ] Same-state orders split tax into CGST + SGST
- [ ] Different-state orders apply IGST instead, with `cgst`/`sgst` set to 0
- [ ] Existing invoices are unaffected (frozen snapshot behavior preserved — never re-derive a past invoice's tax split)

----------------------------------------------------

## TAX-02 Invoice Round-off Line

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Add `invoice.roundOff` (Number), computed once at final invoice assembly as `grandTotal − sum(line items)`.

Reason:
GST invoices should reconcile exactly to the paid amount; no round-off mechanism currently exists on the Invoice model.

Dependencies:
None

Acceptance Criteria

- [ ] `invoice.roundOff` field added
- [ ] Computed once at final invoice assembly, not re-derived later
- [ ] Reflected as its own line on the invoice PDF

----------------------------------------------------

## ORD-01 Restrict Cancellation Window

Status:
🟡 Partial

Priority:
High

Complexity:
Small

Description:
Modify `ORDER_STATUS_TRANSITIONS` so cancellation is no longer reachable from `packed` or later statuses.

Reason:
Code currently allows `packed → cancelled` and `ready_for_dispatch → cancelled`; policy requires cancellation to stop being allowed once status passes `confirmed` ("Orders can generally be cancelled only until Processing/Confirmed... Once Packed/Ready to Ship/Shipped/Out for Delivery, the order can no longer be cancelled").

Dependencies:
None

Acceptance Criteria

- [ ] `ORDER_STATUS_TRANSITIONS` no longer allows a `cancelled` transition from `packed`, `ready_for_dispatch`, `shipped`, or `out_for_delivery`
- [ ] Cancellation remains allowed from `placed`/`confirmed`
- [ ] Attempting to cancel a non-cancellable order returns a clear error

----------------------------------------------------

## RX-01 Enforce Prescription Verification Before Fulfillment

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Wire the existing `order.prescriptionVerified` (Boolean) field into the order fulfillment gate so prescription-required items cannot ship without a verified prescription. No new field needed — this is enforcement logic only.

Reason:
`order.prescriptionVerified` already exists on the Order model but is never read or enforced anywhere in the codebase — a prescription-required medicine can currently be purchased and shipped without any pharmacist check.

Dependencies:
None

Acceptance Criteria

- [ ] Order cannot progress past a defined fulfillment status (e.g. `packed`) while `prescriptionRequired=true` and `prescriptionVerified=false`
- [ ] Admin/pharmacist action sets `prescriptionVerified=true` against an approved prescription upload
- [ ] Order linked to the specific verified `PrescriptionUpload` record (existing model already has `status`, `verifiedBy`, `verifiedAt`, `rejectionReason` — link, don't duplicate)

----------------------------------------------------

# Phase 2 - Admin Panel

## CAT-01-UI Seller Management Screen

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Admin screen to create/edit sellers (`legalName`, `gstin`, `drugLicenseNumber`, `enabled`) and assign warehouses to a seller via `warehouse.sellerId`.

Reason:
No seller management UI exists since the seller entity itself does not yet exist.

Dependencies:
CAT-01

Acceptance Criteria

- [ ] Admin can list/create/edit sellers
- [ ] Admin can assign a warehouse to a seller (sets `warehouse.sellerId`)
- [ ] Seller list shows GSTIN and drug license number

----------------------------------------------------

## RX-01-UI Prescription Verification Screen

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Admin/pharmacist screen to review uploaded prescriptions (existing `PrescriptionUpload` model) against a specific order and approve or reject them.

Reason:
Prescription upload and a generic approve/reject status already exist on the upload record, but there is no screen linking a verification decision to the order it must unblock.

Dependencies:
RX-01

Acceptance Criteria

- [ ] Pharmacist can view a prescription upload alongside the order that requires it
- [ ] Approve action sets `order.prescriptionVerified=true` and `prescriptionUpload.status/verifiedBy/verifiedAt`
- [ ] Reject action records `prescriptionUpload.rejectionReason` and blocks fulfillment

----------------------------------------------------

## CAT-04 Batch-level MRP Override and Recall Flag

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Add `batch.mrp` (Number, optional — used at invoice time if present, else falls back to product MRP) and `batch.recallFlag` (Boolean, default false) to the Batch model, with the MRP override exposed on the admin batch form.

Reason:
Real pharma packs can legally print a different MRP per batch (not currently supported). Recalls happen at batch granularity, not SKU granularity, and there is currently no way to flag a specific batch as recalled.

Dependencies:
None

Acceptance Criteria

- [ ] `batch.mrp` optional field added
- [ ] `batch.recallFlag` field added, default false
- [ ] Invoice/order pricing uses batch MRP when set, else product MRP
- [ ] Admin batch form exposes the MRP override and recall flag

----------------------------------------------------

## CAT-05 Bundle / Combo-pack Pricing

Status:
❌ Missing

Priority:
Medium

Complexity:
Medium

Description:
Add `bundle` (`productId` — the bundle's own sellable SKU, `sellingPrice`) and `bundle_item` (`bundleId`, `componentProductId`, `quantity`, `priceRatio`) collections. The bundle has its own independently-set price; `priceRatio` is computed at bundle creation (`component.listPrice / sum(all component list prices)`) and used only to apportion the bundle's actual charged price across components for GST — never to derive what's charged. Include admin CRUD for creating bundles.

Reason:
Bundle pricing is completely absent from the codebase; no model, service, or admin UI exists.

Dependencies:
None

Acceptance Criteria

- [ ] `bundle` collection created with `productId`, `sellingPrice`
- [ ] `bundle_item` collection created with `bundleId`, `componentProductId`, `quantity`, `priceRatio`
- [ ] Bundle's selling price is independently set, never auto-summed from components
- [ ] `priceRatio` used only for tax apportionment at invoice time, not for computing the charged price
- [ ] Admin CRUD screen to create/edit bundles

----------------------------------------------------

## CAT-06 Category Defaults and Cold-Storage Flag

Status:
🟡 Partial

Priority:
Low

Complexity:
Small

Description:
Add `category.isExpirableDefault` (Boolean) and `category.requiresPrescriptionDefault` (Boolean) so products can inherit sane category-level defaults with per-SKU override. Add `product.medicine.coldStorage` (Boolean) for cold-chain handling.

Reason:
Category currently has no default-inheritance mechanism for expirable/prescription flags (every SKU must be set individually). Medicine sub-schema has genericName/composition/schedule/prescriptionRequired/HSN but no cold-chain flag.

Dependencies:
None

Acceptance Criteria

- [ ] `category.isExpirableDefault` and `category.requiresPrescriptionDefault` fields added
- [ ] Product's expirable/prescription-required resolution falls back to category default when the product-level field is unset
- [ ] `product.medicine.coldStorage` field added and shown in admin product form

----------------------------------------------------

# Phase 3 - Customer Features

## RET-01 Reason-based Return Window

Status:
🟡 Partial

Priority:
Medium

Complexity:
Small

Description:
Replace the single flat `RETURN_WINDOW_DAYS = 7` constant with a reason-keyed window: 2 days for damaged-package/missing-item claims, 7 days for wrong/expired/defective items.

Reason:
Code currently applies one flat 7-day window regardless of return reason (`return.service.ts`: `const RETURN_WINDOW_DAYS = 7`); the published policy requires a shorter 2-day window for damaged/missing claims.

Dependencies:
None

Acceptance Criteria

- [ ] Return window varies by selected reason (config-driven or reason-to-days map, not a single constant)
- [ ] Damaged package / missing product enforces a 2-day window
- [ ] Wrong / expired / defective keeps the existing 7-day window

----------------------------------------------------

## RET-02 Replacement Fulfillment Path

Status:
❌ Missing

Priority:
Medium

Complexity:
Medium

Description:
Add `return.qcResult` (Enum: `SELLABLE` / `DAMAGED` / `EXPIRED` / `TAMPERED`) to drive an automatic restock-vs-write-off decision, and offer a replacement instead of a refund when replacement stock is available, per the published Return/Replacement policy.

Reason:
Only a refund path currently exists (`receiveAndRefundReturn`); the Return model only has a general status enum with no structured QC outcome. The policy explicitly allows replacement as an alternative outcome based on stock availability, and QC result should automatically decide sellable-restock vs written-off — currently there is no separate manual restock-approval step beyond the QC call itself, but there's also no QC-result field to drive it.

Dependencies:
None

Acceptance Criteria

- [ ] `return.qcResult` field added (SELLABLE / DAMAGED / EXPIRED / TAMPERED)
- [ ] SELLABLE result restocks inventory automatically; DAMAGED/EXPIRED/TAMPERED writes off without restocking
- [ ] Return QC step can route to "replacement" as well as "refund"
- [ ] Replacement checks stock availability before offering the option
- [ ] Refund remains the fallback when replacement stock is unavailable

----------------------------------------------------

## CAT-05-UI Bundle Display on Storefront

Status:
❌ Missing

Priority:
Low

Complexity:
Small

Description:
Show bundle/combo-pack products on the customer-facing storefront with their component list.

Reason:
Depends on the bundle model existing; storefront currently has no concept of a bundle product.

Dependencies:
CAT-05

Acceptance Criteria

- [ ] Bundle products are browsable/purchasable on the storefront
- [ ] Bundle detail page lists included components

----------------------------------------------------

# Phase 4 - Shiprocket

## CAT-03 Add Product Weight, Dimensions, Barcode

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Add `product.weightGrams` (Number), `product.lengthMm`/`widthMm`/`heightMm` (Number), and `product.barcode` (String) fields.

Reason:
Required as mandatory fields by Shiprocket's create-order API, and useful for warehouse scanning.

Dependencies:
None

Acceptance Criteria

- [ ] `product.weightGrams` field added
- [ ] `product.lengthMm`, `product.widthMm`, `product.heightMm` fields added
- [ ] `product.barcode` field added, unique when present

----------------------------------------------------

## SHIP-01 Shiprocket API Client + Order Creation

Status:
❌ Missing

Priority:
Critical

Complexity:
Large

Description:
Build a real Shiprocket API client (authentication, create-order call) mapping Order + Invoice + Warehouse data to Shiprocket's required schema. Store the returned identifiers on new `shipment.shiprocketOrderId` and `shipment.shiprocketShipmentId` fields (two plain reference columns, no generic external-ID mapping table needed).

Reason:
No Shiprocket integration exists anywhere in the codebase; only an in-house generic shipment model exists (`orders/shipment.service.ts`), with no third-party courier API calls behind it.

Dependencies:
CAT-02, CAT-03

Acceptance Criteria

- [ ] Shiprocket authentication implemented
- [ ] Order creation call sends correct product, weight, dimension, and address data
- [ ] `shipment.shiprocketOrderId` and `shipment.shiprocketShipmentId` stored against the internal Shipment record

----------------------------------------------------

## SHIP-02 AWB Assignment + Pickup Scheduling

Status:
❌ Missing

Priority:
Critical

Complexity:
Medium

Description:
Call Shiprocket's AWB assignment and pickup scheduling APIs after order creation. Add `shipment.awbCode` and `shipment.courierName` fields (distinct from the existing generic `trackingNumber`/`deliveryPartnerId` staff-entry fields).

Reason:
No AWB or pickup scheduling capability exists; shipments currently require fully manual tracking-number entry by staff.

Dependencies:
SHIP-01

Acceptance Criteria

- [ ] `shipment.awbCode` field added and populated from Shiprocket's response
- [ ] `shipment.courierName` field added and populated from Shiprocket's response
- [ ] Pickup scheduling call made after AWB assignment
- [ ] Failure cases surfaced to admin for retry

----------------------------------------------------

## SHIP-03 Shipping Label Fetch/Display

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Fetch the shipping label from Shiprocket and store it on a new `shipment.labelUrl` field.

Reason:
No shipping label capability exists anywhere in the codebase; the Shipment model has no label URL field populated by any process today.

Dependencies:
SHIP-02

Acceptance Criteria

- [ ] `shipment.labelUrl` field added
- [ ] Label URL fetched from Shiprocket and stored on the Shipment record
- [ ] Label accessible from admin order/shipment view
- [ ] Label accessible from customer order detail view

----------------------------------------------------

## SHIP-04 Tracking Webhook Receiver

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Receive Shiprocket tracking status webhooks and update the existing internal Shipment record automatically.

Reason:
Shipment status is currently updated entirely by manual staff entry; no webhook or polling mechanism exists.

Dependencies:
SHIP-01

Acceptance Criteria

- [ ] Webhook endpoint receives and verifies Shiprocket tracking events
- [ ] Internal Shipment status/timeline updates automatically from webhook events
- [ ] Existing internal Shipment model (status, tracking-event timeline, order-status sync) remains the system of record — do not replace it, feed it

----------------------------------------------------

## SHIP-05 Reverse Pickup (Return Shipment) via Shiprocket

Status:
❌ Missing

Priority:
Medium

Complexity:
Medium

Description:
Trigger a Shiprocket reverse-pickup shipment when a return is approved, mirroring the forward shipment with addresses swapped.

Reason:
Return pickups are currently manual; no courier integration exists for reverse logistics.

Dependencies:
SHIP-01, RET-01

Acceptance Criteria

- [ ] Approved return triggers a Shiprocket reverse-pickup request
- [ ] Reverse shipment tracked using the same internal Shipment/tracking mechanism
- [ ] Pickup status reflected on the Return record

----------------------------------------------------

# Phase 5 - Razorpay

No remaining tasks. Razorpay integration (order creation, payment capture, HMAC-SHA256 signature verification, webhook handling for `payment.captured`/`payment.failed`, refunds, invoice mapping, payment-status sync to order) is fully implemented. See Appendix §5 for the full audit detail.

----------------------------------------------------

# Phase 6 - Branding & UI Polish

## BRND-01 Rebrand Palette to Karien Labs Colors

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Replace the current teal Tailwind `brand` palette (`#0e8f6e`/`#0b7359`/`#095c47`) with the Karien Labs palette: primary `#FF8000`, gradient end `#FF4B33`, background `#FFFFFF`, primary text `#333333`, secondary text `#8A8A8A`.

Reason:
Current UI uses a teal/green palette unrelated to the client's brand identity.

Dependencies:
None

Acceptance Criteria

- [ ] Tailwind `brand` color tokens updated: primary `#FF8000`, gradient end `#FF4B33`
- [ ] Text tokens updated: primary `#333333`, secondary `#8A8A8A`, background `#FFFFFF`
- [ ] All existing `brand-*` class usages inherit the new colors
- [ ] Gradient (`#FF8000` → `#FF4B33`) applied where the brand identity calls for it (buttons/hero/headings), matching the logo's gradient treatment

----------------------------------------------------

## BRND-02 Replace "MedCommerce" with Karien Labs Logo and Name

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Add the supplied Karien Labs logo (`LOGO.jpg.jpeg` — wordmark with heart accent on the "i", gradient orange-to-red) to `apps/web/public/`, and replace all hardcoded "MedCommerce" text (Footer.tsx, `index.html` `<title>`, header/navbar) with the logo image and "Karien Labs" name.

Reason:
The site currently displays no Karien Labs branding — only the placeholder name "MedCommerce" in text form, with no logo image anywhere in the frontend.

Dependencies:
BRND-01

Acceptance Criteria

- [ ] Logo file added to `apps/web/public/` and rendered in the header
- [ ] Footer brand text/link updated from "MedCommerce" to "Karien Labs"
- [ ] Page `<title>` updated to "Karien Labs"

----------------------------------------------------

## BRND-03 Add Favicon

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Generate a favicon set from the Karien Labs logo and wire it into `index.html`.

Reason:
No favicon is currently configured anywhere.

Dependencies:
BRND-02

Acceptance Criteria

- [ ] Favicon files generated from the logo
- [ ] Favicon referenced correctly in the HTML head

----------------------------------------------------

## BRND-04 Add Tagline "Minds That Care"

Status:
❌ Missing

Priority:
Low

Complexity:
Small

Description:
Add the "Minds That Care" tagline to the homepage and/or footer, styled to match the logo's presentation (gray text beneath a thin gradient divider).

Reason:
The tagline does not appear anywhere in the current implementation.

Dependencies:
BRND-02

Acceptance Criteria

- [ ] Tagline displayed on homepage
- [ ] Tagline displayed in footer

----------------------------------------------------

## CMS-01 Load Karien Labs Policy Content

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Enter the actual Karien Labs Privacy Policy, Refund/Return/Cancellation/Exchange Policy, Shipping Policy, Terms & Conditions, Cashback/Wallet/Coupon Code Policy, and B1G1 Offer Terms content (all already fully drafted in `WEBSITE DOCUMENTATION.docx`) into the existing CMS Page editor.

Reason:
The CMS mechanism and policy page routes (`CmsPageView`-backed pages) are fully functional, but contain no content today — policy pages currently render empty. Zero "Karien Labs" references exist anywhere in the current CMS content. This is a content-entry task only, no code changes required.

Dependencies:
None

Acceptance Criteria

- [ ] Privacy Policy page populated and published
- [ ] Refund/Return/Cancellation/Exchange Policy page populated and published (including differentiated 7-day/2-day windows per reason, see RET-01)
- [ ] Shipping Policy page populated and published
- [ ] Terms & Conditions page populated and published
- [ ] Cashback/Wallet/Coupon Code Policy page populated and published (note: Karien Wallet itself is explicitly a "Future Feature" per the source document — do not build wallet functionality, only publish the policy text)
- [ ] B1G1 Offer Terms page populated and published

----------------------------------------------------

## CMS-02 Seed Initial Homepage Banners/Sections

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Populate the homepage's banner and section CMS records with real Karien Labs content so the homepage is not empty on first launch.

Reason:
The homepage rendering mechanism (hero banner, category slider, home sections, top brands, new arrivals, reviews strip, blog preview) is fully CMS-driven and complete, but no banner/section content currently exists.

Dependencies:
BRND-01, BRND-02

Acceptance Criteria

- [ ] Hero banner configured
- [ ] At least one home section (category grid or product grid) configured
- [ ] Content reflects Karien Labs branding

----------------------------------------------------

# Phase 7 - Nice to Have

## NOTIF-01 Wire a Real SMS Provider

Status:
🟡 Partial

Priority:
Medium

Complexity:
Small

Description:
Connect a real SMS provider (e.g. Twilio/MSG91) to the existing pluggable SMS transport (`integrations/notifications/sms-transport.ts`).

Reason:
SMS transport is currently a working log-only stub by design ("No SMS provider wired up... ships as a working log-based transport"); no real provider credentials are wired in. Swapping in a real provider is designed to be a one-file change.

Dependencies:
None

Acceptance Criteria

- [ ] Real SMS provider credentials configured
- [ ] SMS transport sends real messages instead of logging only

----------------------------------------------------

## NOTIF-02 WhatsApp Notification Channel

Status:
❌ Missing

Priority:
Medium

Complexity:
Medium

Description:
Add a WhatsApp notification channel for order confirmations, shipping updates, cashback credit notices, and promotional messages.

Reason:
The published policy documentation references WhatsApp repeatedly as a customer communication channel (order confirmations, cashback credit notifications, tracking updates); no such channel currently exists in the notification system (only email is real, SMS/push are log-only stubs).

Dependencies:
None

Acceptance Criteria

- [ ] WhatsApp channel added to the notification system
- [ ] Order/shipping notifications can be sent via WhatsApp
- [ ] Customer opt-out respected

----------------------------------------------------

# Phase 8 - Employee Access & Auditability

Minimal employee/activity/audit/request-traceability functionality, scoped from the Uniware reference down to what a small medical ecommerce with a handful of internal employees actually needs. Explicitly excludes Uniware's ~180-permission catalog, per-facility/per-tenant RBAC, MongoDB `ActivityMetaVO` architecture, AspectJ field-diff auditing, Hibernate Envers, thread-renaming, script-execution logging, and login-as/impersonation — none of that is relevant at this project's scale.

Context: this project already has a full RBAC system (Role CRUD, permission catalog, per-user permission overrides, `req.user` centrally available to every authenticated service via the auth middleware) and a generic `AuditLog` mechanism already wired into order status changes, returns, purchase orders, GRN, refunds, config changes, role changes, admin-user changes, login/logout, and import/export. The tasks below are targeted fixes and additions on top of that existing foundation — not a rebuild of it.

## AUDIT-01 Formalize Employee vs Customer Identity

Status:
🟡 Partial

Priority:
High

Complexity:
Small

Description:
Confirm and document that `req.user` (id + role), populated centrally by the existing auth middleware, is the single accessor every service uses to determine "who is acting" — no service should accept a username/employee-email as a manually-passed parameter instead. Add a small helper/constant to clearly distinguish internal-employee roles (`admin`, `super_admin`, `inventory_manager`) from the `customer` role at the point of use.

Reason:
The current single `User` collection with a `role` field (rather than a separate `employee` table) already works functionally and already provides a central current-user accessor — this task is about formalizing that pattern consistently, not introducing a new collection, since a full separate employee table would be an unnecessary redesign of a working system at this scale.

Dependencies:
None

Acceptance Criteria

- [ ] Confirmed `req.user` (id, role) is the only source of "current actor" identity used across order/return/refund/purchase-order services
- [ ] Helper/constant added to identify "internal employee" roles distinctly from `customer`
- [ ] No service signature requires a manually-passed username/employee identifier

----------------------------------------------------

## AUDIT-02 Restrict SUPER_ADMIN Assignment via Admin UI

Status:
❌ Missing

Priority:
High

Complexity:
Small

Description:
Prevent the `super_admin` role from being assignable through the normal "create admin user" / "update user role" admin endpoints. Reserve it for the seed script or direct database action only.

Reason:
The existing (already fully-built) roles/permissions system has no restriction today — any admin with user-management permission can currently grant `super_admin` to any user through the standard admin UI. The Uniware reference explicitly removes its equivalent top-tier role from the self-service role-management screen; this is the one small, concrete piece of that pattern worth reusing.

Dependencies:
None

Acceptance Criteria

- [ ] Admin user create/update endpoints reject `role='super_admin'` in the request body
- [ ] `super_admin` remains assignable only via the seed script or a direct database action
- [ ] The existing roles/permissions system (Role CRUD, permission catalog, per-user overrides) is otherwise unchanged

----------------------------------------------------

## AUDIT-03 Order Activity Timeline (`order_activity`)

Status:
❌ Missing

Priority:
High

Complexity:
Medium

Description:
Add a new `order_activity` collection (`orderId` — real FK to order, `actorType`, `actorId`, `actionCode`, `description`, `createdAt`, `requestId` nullable) and write one row on every meaningful order-lifecycle transition: order placed, payment confirmed, invoice generated, courier allocated, shipment created, dispatched, delivered, cancelled, return initiated, return processed, refund processed.

Reason:
Multiple employees may process the same order and the business needs to know who performed each operational action. A generic `AuditLog` already records order status changes, but two of the most important events — invoice generation and dispatch — currently record no activity entry at all (the same gap confirmed in the Uniware reference system). This task closes that gap with a dedicated, lightweight, order-scoped table rather than overloading the existing generic mechanism.

Dependencies:
AUDIT-01

Acceptance Criteria

- [ ] `order_activity` collection created with a real `orderId` foreign key (not a string business code)
- [ ] Activity recorded for: order placed, payment confirmed, invoice generated, courier allocated, shipment created, dispatched, delivered, cancelled, return initiated, return processed, refund processed
- [ ] Invoice auto-generation on payment capture specifically records an activity entry (currently does not)
- [ ] Trivial/non-material database updates do not create activity records

----------------------------------------------------

## AUDIT-04 Request/Correlation ID on Order Activity

Status:
🟡 Partial

Priority:
High

Complexity:
Small

Description:
Propagate the already-existing request-ID middleware's UUID into `order_activity.requestId` whenever an activity is recorded synchronously within an HTTP request, and confirm it is echoed back to the caller as a response header.

Reason:
A request-ID generation middleware already exists and is already used for logging context, but it is not currently stored on any activity/audit record — so there is no way today to go from "this order activity happened" back to the exact application log lines for the request that caused it.

Dependencies:
AUDIT-03

Acceptance Criteria

- [ ] Request ID is generated if not provided, reused if it is
- [ ] Request ID is available in application logging context (already true — confirm, don't rebuild)
- [ ] Request ID returned in the response header
- [ ] Request ID stored on `order_activity.requestId` when the action originates from an HTTP request; left null for background jobs (see AUDIT-06)

----------------------------------------------------

## AUDIT-05 Order Activity Admin View

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Add an order activity/timeline view to the admin order detail screen, showing date/time, action, employee/user, description, and request ID when available.

Reason:
A generic "Audit History" tab already exists for simple CRUD admin modules, but orders use a bespoke detail view that does not currently surface any activity/audit trail at all. A platform-wide Audit Center page also exists but requires manually filtering to a specific order rather than being visible in context.

Dependencies:
AUDIT-03

Acceptance Criteria

- [ ] Order detail view shows a chronological activity list (e.g. "10:31 AM — Invoice Generated — By: admin@karienlabs.com — Request ID: ...")
- [ ] Each entry shows action, actor, timestamp, and request ID when present
- [ ] View reads from `order_activity` filtered by the current order's id

----------------------------------------------------

## AUDIT-06 System Actor Attribution for Automated Actions

Status:
❌ Missing

Priority:
Medium

Complexity:
Small

Description:
Ensure automated/webhook-triggered order mutations record `actorType='SYSTEM'` with a null `actorId` in `order_activity`, instead of attributing the action to a human or — in one confirmed case — to the customer.

Reason:
The Razorpay payment-failure webhook currently compensates (restocks) an order using the customer's own user id as the "performed by" actor, which is inaccurate — the customer did not initiate that action, the webhook did. Automated actions (payment webhooks, scheduled jobs) need to be identifiable as system-initiated without requiring a fake employee account.

Dependencies:
AUDIT-03

Acceptance Criteria

- [ ] Webhook-triggered order compensation (e.g. payment-failure stock restock) records `actorType='SYSTEM'`, not the customer's id
- [ ] Scheduled/background jobs that mutate order-related data record `actorType='SYSTEM'`
- [ ] No fake or placeholder employee account is created to represent system actions

----------------------------------------------------

# Appendix — Full Audit Reference Tables

## A1. Module Status Summary (missing / partial only)

| Module | Status | % | Missing |
|---|---|---|---|
| Auth (Customer) | ✅ Implemented | 95% | WhatsApp OTP channel |
| Auth (Seller) | ❌ Missing | 0% | No seller role, login, or dashboard exists at all |
| Warehouse | 🟡 Partial | 80% | No GSTIN field on warehouse |
| Catalog (Product) | ✅ Implemented | 90% | No barcode, no weight/dimensions, no cold-storage flag |
| Medicine fields | 🟡 Partial | 75% | Missing cold-chain flag |
| Category | 🟡 Partial | 70% | No `is_expirable_default` / `requires_prescription_default` inheritance |
| Bundle Pricing | ❌ Missing | 0% | Zero references anywhere in codebase |
| GST / Tax | 🟡 Partial | 60% | CGST/SGST hardcoded 50/50, IGST always 0; no round-off field |
| Batch | 🟡 Partial | 80% | No batch-level MRP override, no recall flag |
| Order | ✅ Implemented | 90% | Cancellation window doesn't match policy |
| COD | ❌ Missing | 0% | Feature flag exists but zero payment-flow logic (client marked "Future" anyway) |
| Shiprocket | ❌ Missing | 0% | Zero references anywhere in codebase |
| Shipment | 🟡 Partial | 60% | Fully-built generic in-house model; no real courier API behind it |
| Invoice | 🟡 Partial | 70% | GST split is flat, no round-off; HSN correctly frozen |
| Shipping Label | ❌ Missing | 0% | No `labelUrl` field populated anywhere, no label PDF/image capability |
| Return | 🟡 Partial | 75% | Flat 7-day window for all reasons |
| Refund | 🟡 Partial | 80% | Refund-only; no replacement fulfillment path |
| Policies | 🟡 Partial | 40% | Pages route correctly but contain no text today |
| Notifications | 🟡 Partial | 55% | Email real (SMTP); SMS and Push are log-only stubs; no WhatsApp channel |
| Branding | ❌ Missing | 10% | Wrong brand name, wrong palette, no logo file, no favicon |

Fully implemented modules not requiring further work: Auth (Admin), Brand, Pricing, Discount, Coupon, Inventory, Expiry, FEFO, Order Item, Payment (Razorpay), Invoice PDF, Homepage, CMS (engine), Media Upload, Dashboard, Settings/Configuration.

## A2. Business Logic Gap

| Rule | Status | Detail |
|---|---|---|
| GST split by state comparison | ❌ Missing | Hardcoded 50/50 CGST/SGST, IGST always 0 — will produce incorrect tax invoices for any inter-state order |
| Bundle Pricing | ❌ Missing | |
| Invoice round-off | ❌ Missing | |
| Returns (reason-based window) | 🟡 Partial | Flat 7-day window, policy needs 2-day for damaged/missing |
| Order lifecycle vs cancellation policy | 🟡 Partial | Code allows cancel through packed/ready_for_dispatch; policy stops at confirmed |
| Invoice lifecycle | 🟡 Partial | Generated at payment-capture, not pack-complete (minor divergence, acceptable at this scale) |
| Shiprocket flow | ❌ Missing | |
| Shipping label | ❌ Missing | |
| Prescription/Schedule-H gate on checkout | ❌ Missing | `order.prescriptionVerified` field exists but is never read anywhere |
| Batch tracking | 🟡 Partial | No batch-level MRP override |

Fully implemented and requiring no further work: Pricing formula chain, inventory reservation, expiry tracking, FEFO (confirmed correct sort order), shipping charge calculation, coupons.

## A3. Shiprocket Audit

| Capability | Status |
|---|---|
| Order Sync | ❌ Missing |
| Shipment Creation (API call) | ❌ Missing |
| AWB Assignment | ❌ Missing |
| Pickup Scheduling | ❌ Missing |
| Manifest | ❌ Missing |
| Label Fetch | ❌ Missing |
| Tracking (pull or webhook) | ❌ Missing |
| Cancellation | ❌ Missing |
| Return Shipment (reverse pickup) | ❌ Missing |
| Webhook Receiver | ❌ Missing |

Finding: Zero references to "Shiprocket" exist anywhere in the codebase. A complete, well-built generic in-house Shipment module exists instead (status tracking, tracking-event timeline, order-status sync), currently requiring a human to manually enter tracking numbers.

## A4. Razorpay Audit

| Capability | Status |
|---|---|
| Order Creation | ✅ Implemented |
| Payment Capture | ✅ Implemented |
| Signature Verification | ✅ Implemented (HMAC-SHA256) |
| Webhook (captured/failed) | ✅ Implemented |
| Refund | ✅ Implemented |
| Invoice Mapping | ✅ Implemented |
| Payment Status sync to Order | ✅ Implemented |

Finding: Razorpay integration is essentially complete and production-capable. No tasks required.

## A5. Client Requirement Checklist

| Requirement | Status |
|---|---|
| Single Ecommerce Website | ✅ Done |
| 2–3 Sellers | ❌ Missing (single-tenant) |
| 2–3 Warehouses | ✅ Done |
| Shiprocket Integration | ❌ Missing |
| Razorpay Integration | ✅ Done |
| Prepaid Payments | ✅ Done |
| COD (Future) | ❌ Missing (correctly deferred per client note) |
| Product Catalog | ✅ Done |
| Medicine Catalog | 🟡 Partial |
| Inventory | ✅ Done |
| Batch Management | 🟡 Partial |
| Expiry Management | ✅ Done |
| Orders | ✅ Done |
| Invoice | 🟡 Partial |
| Invoice PDF | ✅ Done |
| Shipping Label | ❌ Missing |
| Returns | 🟡 Partial |
| Customer Accounts | ✅ Done |
| Admin Panel | ✅ Done |
| Homepage | ✅ Done |
| Brand Pages | 🟡 Partial (mechanism ✅, content ❌) |
| Policies | 🟡 Partial (mechanism ✅, content ❌) |

## A6. Branding Checklist

| Item | Status | Finding |
|---|---|---|
| Logo | ❌ Missing | No Karien Labs logo file present in `apps/web/public/`; site currently shows no logo image, only text "MedCommerce" |
| Favicon | ❌ Missing | No favicon configured in `index.html` |
| Brand Colors | ❌ Missing | Tailwind `brand` palette is teal/green (`#0e8f6e`); client spec is orange `#FF8000` → red `#FF4B33` gradient |
| Navbar | 🟡 Needs Improvement | Structurally complete, wrong name/colors |
| Footer | 🟡 Needs Improvement | Renders "MedCommerce" text link, wrong colors |
| Buttons | 🟡 Needs Improvement | Use teal `brand-*` classes throughout — will inherit new palette once tokens are swapped |
| Cards | ✅ Done | Generic, will inherit new brand tokens cleanly |
| Typography | 🟡 Needs Improvement | No specific brand font applied; no gradient text treatment matching logo style |
| Gradient | ❌ Missing | No orange→red gradient used anywhere in the UI |
| Homepage | 🟡 Needs Improvement | Structurally complete, cosmetically wrong brand |
| Responsive Design | ✅ Done | Tailwind-based, responsive throughout |
| Tagline "Minds That Care" | ❌ Missing | Not present anywhere in the codebase |

## A7. Executive Summary

The codebase is a fully-functional, well-architected generic medical/pharmacy ecommerce platform (MongoDB/Mongoose, Express, React) built under a placeholder brand ("MedCommerce", teal/green palette). It is not yet aligned to the client's actual brand (Karien Labs, orange→red gradient), and has three structural gaps versus the client's stated scope: no Shiprocket integration exists (shipment tracking is entirely manual/in-house), no multi-seller model exists (single-tenant; only multi-warehouse), and Bundle pricing is entirely absent. Razorpay, catalog, inventory/batch/FEFO, invoicing, coupons, and the admin/customer panels are strong and mostly complete. Policy pages are wired to a CMS but contain zero content today — the mechanism works, the Karien Labs legal text has not been loaded in.
