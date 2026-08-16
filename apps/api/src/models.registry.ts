/**
 * Side-effect import of every domain's models so all Mongoose schemas are
 * registered before the app starts serving — required for `ref` population to
 * resolve and for `syncIndexes()` to see every collection. Imported once from
 * server.ts and worker.ts.
 */
import './modules/auth/models';
import './modules/platform/models';
import './modules/catalog/models';
import './modules/inventory/models';
import './modules/customers/models';
import './modules/orders/models';
import './modules/payments/models';
import './modules/invoices/models';
import './modules/documents/models';
import './modules/coupons/models';
import './modules/delivery/models';
import './modules/tax/models';
import './modules/cms/models';
import './modules/notifications/models';
import './modules/search/models';
import './modules/analytics/models';
import './modules/audit/models';
import './modules/files/models';
import './modules/reviews/models';
