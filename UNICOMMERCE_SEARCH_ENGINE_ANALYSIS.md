# UniCommerce Search Engine Analysis

Investigation date: 2026-08-22
Scope: `UniwareCore`, `UniwareServices`, `UniwareWeb` (Maven multi-module Spring/Hibernate monolith)
Method: Search-first, evidence-based code tracing (no full-repo read)

---

## 1. Executive Summary

UniCommerce (this "Uniware" codebase) does **not** run a dedicated search engine in production code paths. All search, lookup, and filter functionality that is actually invoked is **database search** — Hibernate HQL/Criteria queries and hand-written native SQL using `LIKE` predicates against MySQL, executed directly from application services and DAOs.

The repository *does* declare Elasticsearch and Solr as Maven dependencies (`UniwareCore/pom.xml`), and carries a stray, unused `org.elasticsearch.*` import plus an orphaned `solr.indexing.enabled` config flag — but neither technology has any client bean, query execution, or index-creation code anywhere in the tree. These are **dependency remnants, not active infrastructure**.

Search functionality is implemented via two real, non-search-engine mechanisms:
1. **`GlobalSearchService`** — a hand-coded multi-entity keyword dispatcher (`com.unifier.services.search`) that fans a keyword out to per-domain DB lookups (Sale Orders, Shipping Packages, Purchase Orders, Invoices, Item Types, Vendors, etc.).
2. **The Datatable/Export engine** (`com.unifier.services.export`, `com.unifier.core.table.config`) — a metadata-driven, XML-configured dynamic SQL query builder that powers virtually every list/grid screen in the app (Orders, Customers, Inventory, Putaway, Purchase Orders, etc.) with filters, sorting, and pagination.

Both mechanisms consistently apply tenant (`tenant_id`) and, where relevant, facility (`facility_id`) scoping directly in the query predicates.

---

## 2. Search Technologies Found

| Technology | Found? | Status |
|---|---|---|
| Elasticsearch | Dependency present | **NOT actively used** (no client, no queries, no index code) |
| Solr | Dependency present | **NOT actively used** (no client, no queries; one orphaned config flag) |
| Lucene | Not found | — |
| Algolia | Not found | — |
| MongoDB text search (`$text`) | Not found | MongoDB is used elsewhere (config storage) but not for text search |
| MySQL `FULLTEXT` index | One index defined in a legacy SQL script | **Index exists, but no `MATCH()...AGAINST()` usage found in Java code** — not actively queried |
| MySQL/HQL `LIKE` search | **CONFIRMED, extensively used** | This is the actual, real search mechanism |
| Hibernate Criteria API filtering | **CONFIRMED, extensively used** | Backs most `search*`/`lookup*` DAO methods |
| Custom XML-driven dynamic SQL query builder ("Datatable/Export engine") | **CONFIRMED** | Powers grid search/filter across the web UI |
| Custom `GlobalSearchService` | **CONFIRMED** | Cross-entity keyword search dispatcher |

---

## 3. Confirmed Search Implementations

### A. `GlobalSearchService` (CONFIRMED — application-level, DB-backed)
File: `UniwareServices/src/main/java/com/unifier/services/search/impl/GlobalSearchServiceImpl.java`
A `@Service("globalSearchService")` that implements `IGlobalSearchService`. On `globalSearch()`, it dispatches by `SearchType` (`SALE_ORDER`, `SHIPPING_PACKAGE`, `PURCHASE_ORDER`, `INVOICE`, `ITEM_TYPE`, `VENDOR`, `MANIFEST`, `ORDER_CODE`, `CHANNEL_ORDER_CODE`, `INVOICE_DISPLAY_CODE`, `RATE_CARD`, `UTR_NUMBER`, `REVERSE_PICKUP`) to dedicated private methods, each of which calls an existing domain service/DAO that runs a database query. No search index is touched.

### B. Datatable / Export Query Builder (CONFIRMED — application-level, DB-backed)
File: `UniwareServices/src/main/java/com/unifier/services/export/impl/ExportServiceImpl.java` (method `getDatatableResult()` / `getDatatableResultInternal()`)
Config classes: `UniwareCore/src/main/java/com/unifier/core/table/config/DatatableConfig.java`, `DatatableColumn.java`, `DatatableFilter.java`
Config data: `UniwareServices/src/main/resources/datatables/*.xml` (e.g. `datatable-search-orders.xml`, `datatable-search-customers.xml`, `datatable-search-inflow-receipts.xml`, `datatable-search-putaway.xml`, `datatable-search-purchase-orders.xml`, `datatable-search-reverse-pickups.xml`, `datatable-search-orders-b2b.xml`, `datatable-search-gatepassorder.xml`, `datatable-search-reshipments.xml`).
Each XML file defines a base SQL `<queryString>`, a set of `<columns>` (with SQL expressions), a set of `<filters>` (each with a parameterized SQL `condition`, e.g. `LIKE`, `IN`, date-range `>`/`<`), a `<defaultSortBy>` and a `<groupBy>`. `ExportServiceImpl` reads the matching config by name, binds request filter values (via Spring EL `valueExpression`, some backed by `UserContext`), assembles a dynamic native SQL statement, and executes it. This is the mechanism behind nearly every "search/filter" grid in the product (Orders, Customers, Inventory, Putaway, Purchase Orders, etc.).

### C. Direct DAO-level "search"/"lookup" methods (CONFIRMED — DB search via Hibernate)
Consistent pattern found across many DAOs: Hibernate `Criteria` with `Restrictions.like("field", "%kw%")`, or hand-written HQL/native SQL with `LIKE`. Examples:
- `CatalogDaoImpl.lookupItemTypes()` — native SQL `UNION` query with `sku_code LIKE`, `name LIKE`, `scan_identifier LIKE` (see §9).
- `CatalogDaoImpl.getSearchItemTypeCriteria()` — Hibernate `Criteria` with `OR`-chained `Restrictions.like` over `name`, `color`, `description`, `brand`, category name.
- `CustomerDaoImpl.getCustomersByCode()` / `getCustomerByCodeEmailOrMobile()` — HQL with `LIKE` across code/name/email/phone.
- `LookupDaoImpl.searchInventory()` — Hibernate `Criteria`, facility-scoped, `LIKE` on shelf code / item name / SKU code.

### D. Elasticsearch / Solr dependencies (NOT CONFIRMED as used — dormant)
`UniwareCore/pom.xml` declares `spring-data-elasticsearch:1.1.0.RELEASE` and `spring-data-solr:1.1.1.RELEASE`. No Spring XML bean definitions, no `ElasticsearchTemplate`/`ElasticsearchRepository`/`RestHighLevelClient`/`TransportClient`, no `SolrTemplate`/`SolrClient`/`SolrCrudRepository` were found anywhere in `src/main` across all modules. A single stray import `org.elasticsearch.common.recycler.Recycler` exists in `ConfigurationMao.java` but is unused — the class only talks to MongoDB. A single orphaned config accessor `SystemConfiguration.isSolrIndexingEnabled()` (backed by property key `solr.indexing.enabled`) exists but has **zero callers** anywhere in the codebase.

**Conclusion: the ES/Solr dependencies are legacy/vestigial. No genuine search-engine execution path exists.**

---

## 4. Search Architecture

### 4.1 Global keyword search (multi-entity)
```
                    ┌─────────────────────────────┐
                    │ POST /data/search/globalSearch│  (JAX-RS, SearchResource)
                    └───────────────┬───────────────┘
                                    ↓
                    ┌─────────────────────────────┐
                    │ IGlobalSearchService.globalSearch()│
                    │ GlobalSearchServiceImpl            │
                    └───────────────┬───────────────┘
                                    ↓  (dispatch by SearchType)
      ┌────────────┬────────────┬────────────┬────────────┬────────────┐
      ↓            ↓            ↓            ↓            ↓            ↓
 SaleOrderService ShippingService PurchaseService InvoiceService CatalogService VendorService ...
      ↓            ↓            ↓            ↓            ↓            ↓
   Hibernate HQL/Criteria + native SQL, LIKE predicates, tenant/facility scoped
      ↓
                    ┌─────────────────────────────┐
                    │        MySQL database        │
                    └─────────────────────────────┘
```

### 4.2 Autocomplete / typeahead lookups
```
GET /data/lookup/{vendors|itemTypes|party|users|customers|categories|...}
        ↓
AutocompleteSearchResource (JAX-RS controller)
        ↓
Domain service (ICatalogService, IVendorService, ICustomerService, IUsersService, IPartyService, ...)
        ↓
DAO — Hibernate Criteria / HQL / native SQL with LIKE, capped result count (typically 10)
        ↓
MySQL database
```

### 4.3 Grid/list search & filter (Datatable engine)
```
POST /data/tasks/export/data  (TasksResource.getDatatableResultResponse)
        ↓
IExportService.getDatatableResult()  →  ExportServiceImpl
        ↓
Load DatatableConfig by name (XML, e.g. DATATABLE_SEARCH_ORDERS)
        ↓
Bind request filters → parameterized SQL fragments (LIKE / IN / date range)
        ↓
Assemble dynamic native SQL (base queryString + filters + groupBy + sort + pagination)
        ↓
Execute against MySQL, map rows → WsDatatableRow
        ↓
JSON response back to UI grid
```

### 4.4 Reco (reconciliation) search — external microservice delegate
```
POST /data/reco/v1/search/order  or  /utr
        ↓
com.uniware.web.controller.reco.SearchController
        ↓
IUniRecoClientService (HTTP client to the separate "UniReco" microservice)
```
This delegates to an external service (`UniReco`) whose internals are **outside this repository** — not confirmed from available code what storage/search technology it uses internally.

---

## 5. Search APIs

### Global / Cross-entity Search
| Method | Endpoint | Controller | Params | Service Method |
|---|---|---|---|---|
| GET | `/data/search/getAllSearchTypes` | `SearchResource` (`UniwareWeb/.../controller/SearchResource.java`) | — | `IGlobalSearchService.getAllSearchTypes(productCode)` |
| POST | `/data/search/globalSearch` | `SearchResource` | body `GlobalSearchRequest{keyword,type}` | `IGlobalSearchService.globalSearch(request)` |

### Product / SKU / Catalog Search
| Method | Endpoint | Controller | Params | Service/DAO |
|---|---|---|---|---|
| GET | `/data/lookup/itemTypes` | `AutocompleteSearchResource` | `keyword` | `ICatalogService.lookupItemTypes()` → `CatalogDaoImpl.lookupItemTypes()` (native SQL UNION, LIKE) |
| GET | `/data/lookup/allItemTypes` | `AutocompleteSearchResource` | `keyword`, `type` | `ICatalogService.lookupAllItemTypes()` |
| GET | `/data/lookup/linkedChannelItemTypes` | `AutocompleteSearchResource` | `channelCode`, `keyword` | `IChannelCatalogService.lookupLinkedChannelItemTypes()` |
| GET | `/data/lookup/categories` | `AutocompleteSearchResource` | `keyword` | `ICatalogService.lookupCategories()` |
| POST | (internal) `ICatalogService.searchItemTypes` | — | `SearchItemTypesRequest` | `CatalogDaoImpl.searchItemTypes()` (Hibernate Criteria, `LIKE`, paginated) |

### Order Search
| Method | Endpoint | Controller | Params | Service |
|---|---|---|---|---|
| POST | `/data/search/globalSearch` (`type=SALE_ORDER`) | `SearchResource` | `keyword` | `ISaleOrderService.searchSaleOrderByDisplayOrderCode/ByOrderCode/searchFailedOrPartialOrder` |
| POST | `/data/tasks/export/data` (config `DATATABLE_SEARCH_ORDERS`) | `TasksResource` | filters (order#, customer, item, status, date range, channel, facility) | `ExportServiceImpl.getDatatableResult()` |
| POST | `/data/reco/v1/search/order` | `com.uniware.web.controller.reco.SearchController` | `SearchOrderAPIRequest` | `IUniRecoClientService.fetchSaleOrderResponse()` (external reco microservice) |

### Inventory Search
| Method | Endpoint | Controller | Params | Service |
|---|---|---|---|---|
| (internal API) | `ILookupService.searchInventory` | — | `SearchInventoryRequest{shelf,itemType,...}` | `LookupDaoImpl.searchInventory()` (Hibernate Criteria, facility-scoped, `LIKE`) |
| POST | `/data/tasks/export/data` (Inventory/Putaway datatable configs) | `TasksResource` | filters | `ExportServiceImpl.getDatatableResult()` |

### Customer / Party / Vendor Search
| Method | Endpoint | Controller | Params | Service |
|---|---|---|---|---|
| GET | `/data/lookup/customers` | `AutocompleteSearchResource` | `keyword` | `ICustomerService.lookupCustomers()` → `CustomerDaoImpl.getCustomersByCode()` (HQL `LIKE`) |
| GET | `/data/lookup/customerDetails` | `AutocompleteSearchResource` | `keyword` | `ICustomerService.getCustomersByCodeEmailOrMobile()` → `CustomerDaoImpl.getCustomerByCodeEmailOrMobile()` (HQL `LIKE` across code/name/email/phone) |
| GET | `/data/lookup/vendors` | `AutocompleteSearchResource` | `name` | `ICatalogService.lookupVendors()` |
| GET | `/data/lookup/party` | `AutocompleteSearchResource` | `keyword` | `IPartyService.lookupParty()` |
| GET | `/data/lookup/users` | `AutocompleteSearchResource` | `name`/`email`/`nameOrEmail` | `IUsersService.lookupUsers*()` |
| GET | `/data/lookup/billingParty` | `AutocompleteSearchResource` | `keyword` | `IBillingPartyService.lookupBillingParty()` |

### Catalog/Global Search (other domains reachable via GlobalSearchService)
`SHIPPING_PACKAGE`, `PURCHASE_ORDER`, `INVOICE`, `MANIFEST`, `RATE_CARD`, `UTR_NUMBER`, `REVERSE_PICKUP`, `ORDER_CODE`/`CHANNEL_ORDER_CODE`/`INVOICE_DISPLAY_CODE` (reconciliation) — all routed through `SearchResource.globalSearch()` → `GlobalSearchServiceImpl`, each backed by its own domain DAO query (see §3.A).

---

## 6. Search Flow

**Step-by-step for `POST /data/search/globalSearch`:**
1. `SearchResource.globalSearch(GlobalSearchRequest request)` — `UniwareWeb/src/main/java/com/uniware/web/controller/SearchResource.java:43`
2. → `IGlobalSearchService.globalSearch(request)` — `GlobalSearchServiceImpl.java:159`
3. Validates request (`request.validate()`), trims keyword.
4. Switches on `request.getType()`; if absent, runs a default bundle (Sale Orders, Shipping Packages if facility set, Purchase Orders, Item Types, Vendors).
5. Each `searchX(keyword)` private method:
   - Looks up display metadata (`SearchTypeDTO`, incl. `landingPageUrl` template) from `SearchTypeCache` (in-memory cache backed by `SearchTypes` DB table).
   - Calls the relevant domain service (e.g. `saleOrderService.searchSaleOrderByDisplayOrderCode(keyword)`), which issues an HQL/Criteria/native SQL query with `LIKE`/`=` predicates, scoped by `tenant.id` (and `facility.id` where applicable, implicitly via `UserContext`).
   - Wraps each DB row into a `SearchDTO.Entry(displayLabel, resolvedUrl)`, resolving `landingPageUrl` via a small expression-language evaluator (`com.unifier.core.expressions.Expression`).
6. Aggregates all `SearchDTO`s into `GlobalSearchResponse`, returns as JSON.

No search index, no relevance scoring, no ranking algorithm is present — result order is DB row order (often `ORDER BY created DESC` or default primary-key order), and different sub-searches are simply concatenated by type.

---

## 7. Indexing Flow

**Not applicable / Not confirmed.** No indexing pipeline exists for any dedicated search engine, because no dedicated search engine is actively used. Data is queried live from MySQL on every search request via `LIKE`/Criteria — there is no separate "index" being built, updated, or synchronized from entity changes.

The one artifact resembling "indexing" is a plain MySQL `FULLTEXT INDEX` (a native RDBMS index, not a separate document store):
- File: `finalStreamlinedIndexForAllServers.sql:1`
- `CREATE FULLTEXT INDEX full_sku_code ON item_type(sku_code);`
- No `MATCH(...) AGAINST(...)` query was found anywhere in the Java codebase referencing this index — it is not confirmed to be actively exercised by the application; `sku_code` lookups instead use `LIKE 'keyword%'` (see `CatalogDaoImpl.lookupItemTypes()`), which MySQL's optimizer can serve from a regular B-tree index rather than the fulltext index.

No `@KafkaListener`/`@RabbitListener` tied to search/indexing was found. No `reindex`, `bulkIndex`, or `indexDocument` methods were found anywhere in `src/main`.

---

## 8. Indexes / Collections / Tables

Since there is no active dedicated search engine, "indexes" here means the relational tables/columns queried directly by search code, plus their supporting DB indexes referenced in schema/migration SQL:

| Table | Key searchable columns | Used by |
|---|---|---|
| `item_type` | `sku_code`, `name`, `scan_identifier`, `description`, `brand`, `color` | `CatalogDaoImpl.lookupItemTypes()`, `getSearchItemTypeCriteria()` |
| `sale_order` | `code`, `display_order_code`, `customer_name`, `notification_email`, `notification_mobile`, `status_code` | `SaleOrderServiceImpl.searchSaleOrderBy*()`, datatable `DATATABLE_SEARCH_ORDERS` |
| `sale_order_item` | `status_code`, `seller_sku_code`, `channel_product_id` | datatable `DATATABLE_SEARCH_ORDERS` (joined) |
| `customer` (`Customer` entity) | `code`, `name`; joined `party_contact.email/phone`, `party_address.phone` | `CustomerDaoImpl.getCustomersByCode/getCustomerByCodeEmailOrMobile` |
| `item_type_inventory` (`ItemTypeInventory`) | `shelf.code`, `item_type.name`, `item_type.sku_code`, `quantity>0` | `LookupDaoImpl.searchInventory()` |
| `purchase_order` | `code` (pattern consistent with other `search*` DAOs) | `IPurchaseService.searchPurchaseOrder()` |
| `shipping_package` | `code`, tracking number | `IShippingService.getShippingPackagesByTrackingNumber/getShippingPackageByCode()` |

`item_type.sku_code` also carries a MySQL `FULLTEXT INDEX` (`full_sku_code`) — present in schema but **not confirmed to be queried** (see §7).

No Elasticsearch index, Solr core, or Mongo collection is used for text search anywhere in the confirmed code paths.

---

## 9. Search Query Construction

### Query types actually implemented (all DB-level, not search-engine-level)
- **Prefix match:** `CatalogDaoImpl.lookupItemTypes()` uses `sku_code LIKE :keyword` with parameter bound as `keyword + "%"` (prefix), and similarly for `scan_identifier`.
- **Substring/contains match:** Most other `lookup*`/`search*` methods bind `"%" + keyword + "%"` (e.g. `CustomerDaoImpl.getCustomersByCode()`, `getCustomerByCodeEmailOrMobile()`, `LookupDaoImpl` shelf/item filters, `CatalogDaoImpl.getSearchItemTypeCriteria()`).
- **Configurable prefix vs. contains:** `CatalogDaoImpl.lookupItemTypes()` toggles the `name` match between prefix (`keyword%`) and contains (`%keyword%`) based on the tenant config flag `isFullProductNameSearchEnabled()` (`TenantSystemConfiguration`).
- **Multi-field OR search:** `getSearchItemTypeCriteria()` builds an `OR` chain across `name`, `color`, `description`, `brand`, category name via Hibernate `Restrictions.or(...)`.
- **Multi-query UNION:** `lookupItemTypes()` issues three separate `LIKE` sub-queries (on `sku_code`, `name`, `scan_identifier`) combined with SQL `UNION`, each capped at 10 rows.
- **Exact match:** e.g. `DATATABLE_SEARCH_ORDERS` filter `orderNumberFilter`: `so.code = :orderNumberFilter or so.display_order_code = :orderNumberFilter`.
- **IN-list filtering:** e.g. `statusFilter`: `so.status_code in (:statusFilter)` (multiselect).
- **Date-range filtering:** e.g. `dateRangeFilter`: `so.display_order_date_time > :start and < :end`.
- **Boolean filtering:** e.g. `onHoldFilter`: `soi.on_hold = :onHoldFilter`.

### Not present
- No `bool`/`must`/`should`/`must_not` query DSL (Elasticsearch-style) — no such construct exists anywhere in the code.
- No fuzzy matching, edit-distance, or phonetic matching.
- No wildcard search beyond simple SQL `LIKE '%x%'`.
- No tokenizer/analyzer/synonym configuration.
- No computed relevance score — result order is plain SQL `ORDER BY` (e.g. `created DESC`, `so.id desc`), not relevance-ranked.

---

## 10. Searchable Fields

| Domain | Searchable fields |
|---|---|
| Item Type / SKU | `sku_code`, `name`, `scan_identifier`, `description`, `brand`, `color`, category name |
| Sale Order | `code`, `display_order_code`, `customer_name`, `notification_email`, `notification_mobile` |
| Customer | `code`, `name`, contact `email`, contact/address `phone` |
| Inventory | `shelf.code`, `item_type.name`, `item_type.sku_code` |
| Vendor | `code`/`name` (via `IVendorService.searchVendor`) |
| Purchase Order | `code` |
| Shipping Package | `code`, tracking number |
| Invoice | `code` (via `IInvoiceService.searchInvoice`) |

---

## 11. Filters and Tenant Isolation

**CONFIRMED**: Tenant isolation is applied directly inside the same query that performs the keyword match — it is not a separate post-filter step.

- `CatalogDaoImpl.lookupItemTypes()`: native SQL binds `tenant_id = :tenantId` where `tenantId = UserContext.current().getTenantId()` (`CatalogDaoImpl.java:476`).
- `CustomerDaoImpl.getCustomersByCode()` / `getCustomerByCodeEmailOrMobile()`: HQL `... and c.tenant.id = :tenantId ...`, bound from `UserContext.current().getTenantId()`.
- `LookupDaoImpl.searchInventory()`: Hibernate Criteria scoped by `facility` via `Restrictions.idEq(UserContext.current().getFacilityId())` — **facility-level** isolation (inventory is facility-scoped, not just tenant-scoped).
- Datatable filters (`datatable-search-orders.xml`): explicit hidden filters —
  - `tenantId` filter: `so.tenant_id = :tenantId`, `valueExpression="#{T(com.uniware.core.utils.UserContext).current().getTenant().getId()}"`
  - `facilityId` filter: `(:facilityId is null or soi.facility_id = :facilityId)`, bound the same way.
- `GlobalSearchServiceImpl.globalSearch()`: gates which sub-searches run based on `UserContext.current().getFacilityId() != null` (Shipping Packages / Purchase Orders only searched when a facility context is present), and `getAllSearchTypes()` filters visible search types by `isRecoRequest`/`isAllFacility` derived from `UserContext`.

**Pattern**: `UserContext` (a thread-local-style request context) is the single source of tenant/facility identity, consistently threaded into DAO query parameters or Criteria restrictions — not relied upon as an assumption but explicitly verified in each DAO above.

No evidence was found of channel-, warehouse-, or role-based scoping being applied *within* search queries beyond the access-resource/role gating done at the controller layer (e.g. `TasksResource` checks `accessResources.contains(exportConfig.getAccessResourceName())` before running a datatable query — this is an authorization check, not a query-level filter).

---

## 12. Pagination / Sorting / Ranking

- **Pagination:** Implemented via Hibernate `Criteria.setFirstResult()/setMaxResults()` driven by `SearchOptions.getDisplayStart()/getDisplayLength()` (e.g. `CatalogDaoImpl.searchItemTypes()`, `LookupDaoImpl.searchInventory()`). The Datatable engine additionally supports SQL-level `LIMIT`/offset consistent with DataTables.js server-side processing conventions.
- **Sorting:** Explicit `ORDER BY`/`addOrder()` — e.g. `criteria.addOrder(Order.desc("created"))`; Datatable XML configs declare `sortable="true"` per column and a `<defaultSortBy>` (e.g. `so.id desc`).
- **Ranking/Relevance:** **Not present.** No scoring model exists; ordering is purely by declared SQL sort columns, not textual relevance.

---

## 13. Result Processing

- Results are **not** ID-only lookups against a separate index followed by a hydration query — since there is no separate index, DAOs query the full row directly from MySQL and map straight to DTOs (e.g. `CustomerSearchDTO`, `ItemTypeLookupDTO`, `SearchDTO.Entry`).
- `GlobalSearchServiceImpl` wraps each result row with a resolved deep-link URL (`Expression.compile(searchType.getLandingPageUrl()).evaluate(params, String.class)`) — a templating/enrichment step, not search-engine result enrichment.
- Deduplication: `searchSaleOrders()` merges two query result sets into a `HashSet<SaleOrder>` before building the response (relies on entity `equals()`/`hashCode()`, presumably by ID).
- No cross-tenant leakage risk identified in the traced code — tenant/facility predicates are part of the same query, not a post-filter.

---

## 14. Configuration

- `SystemConfiguration.SOLR_INDEXING_ENABLED` = `"solr.indexing.enabled"` (config key name only; **no code path consumes it** — see §3.D). No corresponding host/port/credential keys for Solr or Elasticsearch were found in any `.properties`/`.yml`/`.xml` file in the repo (only the Maven dependency declarations exist).
- `TenantSystemConfiguration.isFullProductNameSearchEnabled()` — tenant-level feature flag toggling prefix vs. contains match for product-name search in `lookupItemTypes()`.
- `TenantSystemConfiguration.getDatatablesDataRangeInMonths()` — bounds how far back datatable/grid queries look, referenced in `ExportServiceImpl.getDatatableResultInternal()`.
- No search-engine cluster URLs, hosts, ports, connection pools, or retry configuration were found anywhere (consistent with §3.D — nothing to configure because nothing is instantiated).

---

## 15. Background Jobs / Events Related to Search

**None found.** No scheduled job, event listener, or message consumer (`@KafkaListener`, `@RabbitListener`, quartz/cron jobs) was found that performs indexing, reindexing, or search-index synchronization. All search paths query MySQL live and synchronously within the request.

---

## 16. Important Classes and Methods

| Class | Method | Purpose |
|---|---|---|
| `com.uniware.web.controller.SearchResource` | `globalSearch()`, `getAllSearchTypes()` | JAX-RS entry point for global keyword search |
| `com.uniware.web.controller.AutocompleteSearchResource` | `lookupItemTypes()`, `lookupCustomer()`, `lookupVendors()`, etc. | JAX-RS entry points for typeahead/autocomplete |
| `com.unifier.services.search.impl.GlobalSearchServiceImpl` | `globalSearch()`, `searchSaleOrders()`, `searchItemTypes()`, `searchVendors()`, etc. | Cross-entity keyword search dispatcher |
| `com.uniware.dao.catalog.impl.CatalogDaoImpl` | `lookupItemTypes()`, `getSearchItemTypeCriteria()` | SKU/product search (native SQL + Criteria, `LIKE`) |
| `com.uniware.dao.customer.impl.CustomerDaoImpl` | `getCustomersByCode()`, `getCustomerByCodeEmailOrMobile()` | Customer search (HQL, `LIKE`) |
| `com.uniware.dao.lookup.impl.LookupDaoImpl` | `searchInventory()`, `getCriteriaFromRequest()` | Inventory search (Criteria, facility-scoped) |
| `com.unifier.services.export.impl.ExportServiceImpl` | `getDatatableResult()`, `getDatatableResultInternal()` | Generic XML-driven dynamic SQL query builder for grid search/filter |
| `com.unifier.core.table.config.DatatableConfig/-Column/-Filter` | — | Parsed representation of `datatables/*.xml` search-grid definitions |
| `com.uniware.web.controller.reco.SearchController` | `searchOrders()`, `searchUTRDetails()` | Delegates to external UniReco microservice client |
| `com.uniware.services.configuration.SystemConfiguration` | `isSolrIndexingEnabled()` | Orphaned/dead config accessor (no callers) |

---

## 17. File Reference Map

```
UniwareWeb/src/main/java/com/uniware/web/controller/SearchResource.java
UniwareWeb/src/main/java/com/uniware/web/controller/AutocompleteSearchResource.java
UniwareWeb/src/main/java/com/uniware/web/controller/reco/SearchController.java
UniwareWeb/src/main/java/com/unifier/web/controller/TasksResource.java              (export/data endpoint → Datatable engine)
UniwareWeb/src/main/java/com/uniware/web/services/rest/UniwareRESTMobileServicesEndPoint.java (mobile export/data endpoint)

UniwareServices/src/main/java/com/unifier/services/search/IGlobalSearchService.java
UniwareServices/src/main/java/com/unifier/services/search/impl/GlobalSearchServiceImpl.java
UniwareServices/src/main/java/com/unifier/dao/searchtype/ISearchTypeDao.java
UniwareServices/src/main/java/com/unifier/dao/searchtype/impl/SearchTypeDaoImpl.java
UniwareServices/src/main/java/com/unifier/services/export/IExportService.java
UniwareServices/src/main/java/com/unifier/services/export/impl/ExportServiceImpl.java
UniwareServices/src/main/java/com/uniware/dao/catalog/impl/CatalogDaoImpl.java
UniwareServices/src/main/java/com/uniware/dao/customer/impl/CustomerDaoImpl.java
UniwareServices/src/main/java/com/uniware/dao/lookup/impl/LookupDaoImpl.java
UniwareServices/src/main/java/com/uniware/services/configuration/SystemConfiguration.java   (SOLR_INDEXING_ENABLED — dead flag)
UniwareServices/src/main/java/com/univolumetric/dao/configuration/impl/ConfigurationMao.java (unused org.elasticsearch import)
UniwareServices/src/main/resources/datatables/*.xml                                  (search-grid definitions, ~15+ files)
UniwareServices/src/test/java/com/uniware/services/search/TestSearchService.java

UniwareCore/src/main/java/com/uniware/core/api/search/GlobalSearchRequest.java
UniwareCore/src/main/java/com/uniware/core/api/search/GlobalSearchResponse.java
UniwareCore/src/main/java/com/uniware/core/api/search/SearchType.java
UniwareCore/src/main/java/com/uniware/core/api/search/SearchTypeDTO.java
UniwareCore/src/main/java/com/uniware/core/api/search/SearchDTO.java
UniwareCore/src/main/java/com/unifier/core/entity/SearchTypes.java
UniwareCore/src/main/java/com/unifier/core/table/config/DatatableConfig.java
UniwareCore/src/main/java/com/unifier/core/table/config/DatatableColumn.java
UniwareCore/src/main/java/com/unifier/core/table/config/DatatableFilter.java
UniwareCore/pom.xml                                                                   (spring-data-elasticsearch, spring-data-solr deps — unused)

finalStreamlinedIndexForAllServers.sql                                               (CREATE FULLTEXT INDEX full_sku_code ON item_type(sku_code) — not queried in Java)
```

---

## 18. Search Engine Dependency Verification

**Technology: Elasticsearch**
- Evidence of dependency: `UniwareCore/pom.xml:135-137` (`spring-data-elasticsearch:1.1.0.RELEASE`)
- Evidence of configuration: None found
- Evidence of client creation: None found
- Evidence of query execution: None found
- Evidence of indexing: None found
- Conclusion: **Elasticsearch is present as a dependency but no active search execution was found in the investigated code paths.**

**Technology: Solr**
- Evidence of dependency: `UniwareCore/pom.xml:158-161` (`spring-data-solr:1.1.1.RELEASE`)
- Evidence of configuration: One orphaned property key `solr.indexing.enabled` / `SystemConfiguration.isSolrIndexingEnabled()` — accessor exists but is never called
- Evidence of client creation: None found
- Evidence of query execution: None found
- Evidence of indexing: None found
- Conclusion: **Solr is present as a dependency (and one dead config flag) but no active search execution was found in the investigated code paths.**

**Technology: MySQL FULLTEXT**
- Evidence of dependency: N/A (native RDBMS feature)
- Evidence of configuration: `CREATE FULLTEXT INDEX full_sku_code ON item_type(sku_code)` in `finalStreamlinedIndexForAllServers.sql`
- Evidence of client creation: N/A
- Evidence of query execution: **None found** (no `MATCH()...AGAINST()` in Java code)
- Evidence of indexing: Index DDL exists in schema scripts
- Conclusion: **A MySQL FULLTEXT index exists on `item_type.sku_code`, but no active `MATCH...AGAINST` query execution was found. Application code instead uses `LIKE` predicates for SKU search.**

**Technology: MySQL `LIKE` / Hibernate Criteria (application-level DB search)**
- Evidence of dependency: Hibernate/Spring ORM (already core to the app)
- Evidence of configuration: N/A
- Evidence of client creation: `SessionFactory` (standard Hibernate)
- Evidence of query execution: **CONFIRMED** — dozens of `search*`/`lookup*` DAO methods (§3.C, §9)
- Evidence of indexing: N/A (queries live rows; relies on standard B-tree DB indexes)
- Conclusion: **This is the actual, actively used search mechanism across the product.**

---

## 19. Potential Performance Considerations

- `LIKE '%keyword%'` (leading-wildcard) patterns — used in `CustomerDaoImpl`, `getSearchItemTypeCriteria()`, `LookupDaoImpl` — cannot use a standard B-tree index prefix and will typically force full/near-full table scans at scale. This is a direct consequence of not having a dedicated search index.
- `lookupItemTypes()` runs three separate `LIKE` sub-queries combined via `UNION`, each independently capped at 10 rows — reasonable for autocomplete latency but means three index scans per keystroke-driven request.
- The Datatable engine assembles **dynamic native SQL** per request from XML-declared fragments; complex grids (e.g. `DATATABLE_SEARCH_ORDERS`) join `sale_order` × `sale_order_item` × `item_type` × `channel` with `GROUP BY so.id` and `GROUP_CONCAT` aggregations — potentially expensive at high order volumes, especially combined with a leading-wildcard filter.
- No caching layer was identified in front of search queries (aside from unrelated caches like `SearchTypeCache`, which only caches search *metadata*, not search *results*).
- The unused MySQL `FULLTEXT` index on `item_type.sku_code` still incurs write-side maintenance cost (every insert/update to `item_type.sku_code` maintains this index) without being read from — a possible cleanup candidate, though this is a schema/ops decision outside this investigation's scope.

---

## 20. Potential Risks / Gaps

- **No genuine full-text/fuzzy/relevance search** exists for product catalog, despite catalogs typically being large — `LIKE`-based search will degrade with data growth and offers no typo-tolerance.
- **Dead dependencies** (`spring-data-elasticsearch`, `spring-data-solr`) add build weight and potential CVE surface without functional benefit — worth flagging to whoever owns dependency hygiene.
- **Orphaned config flag** `solr.indexing.enabled` could mislead an engineer into thinking Solr indexing is toggleable/active; it is not.
- **Unused `FULLTEXT` index** on `item_type.sku_code` — write overhead with no confirmed read benefit.
- Search/filter logic is **duplicated** across `GlobalSearchServiceImpl` DAO calls and the separate Datatable XML query-builder engine — two parallel systems implement overlapping "search orders/customers/inventory" functionality with different tenant-scoping mechanisms (Java `UserContext` param binding vs. SpEL `valueExpression` in XML), which is a consistency/maintenance risk if one path is updated for a new security rule and the other is missed.

---

## 21. Unknowns / Areas Requiring Further Investigation

- **UniReco microservice** (behind `IUniRecoClientService`, invoked by `com.uniware.web.controller.reco.SearchController`) — its internal search implementation is **not confirmed** from this repository; it is a separate deployable not included in this codebase.
- Whether the `spring-data-elasticsearch`/`spring-data-solr` dependencies are actually resolved/shaded into a running artifact, or excluded at packaging time, was **not verified** (would require inspecting the built WAR/JAR or deployment manifests, which is outside a source-only investigation).
- Whether any other module outside `UniwareCore`/`UniwareServices`/`UniwareWeb` (e.g. anything under `UniwareStandalone`, `UniwareInstrumentation`, `UniwareORMRevEng`) has search-adjacent code was **not exhaustively checked** — a targeted grep found nothing, but these modules were not read in depth per the "search-first, don't read everything" instruction.
- Historical/legacy scripts (`build_*.sql`, `mongo.js`, `Trigger.sql` etc.) were not exhaustively scanned beyond targeted keyword grep; there could be older or since-removed search-related schema artifacts not surfaced here.

---

## 22. Final Conclusion

```text
SEARCH ENGINE FOUND:
Partially confirmed — a MySQL FULLTEXT index exists but is not actively queried;
Elasticsearch/Solr dependencies exist but are not wired into any code path.
No dedicated search engine is actively used anywhere in the traced code.

PRIMARY TECHNOLOGY:
MySQL via Hibernate (HQL / Criteria API) and hand-written native SQL,
using LIKE-based substring/prefix matching. No relevance ranking.

PRIMARY SEARCH DOMAINS:
Sale Orders, Shipping Packages, Purchase Orders, Invoices, Item Type/SKU/Catalog,
Vendors, Customers, Inventory, Reconciliation (order code / UTR / rate card),
Reverse Pickups, plus generic grid search/filter (Datatable/Export engine) across
most list screens in the application.

PRIMARY ENTRY POINTS:
POST /data/search/globalSearch, GET /data/search/getAllSearchTypes  (SearchResource)
GET  /data/lookup/*                                                  (AutocompleteSearchResource)
POST /data/tasks/export/data, /export/data/resultcount               (TasksResource → Datatable engine)
POST /data/reco/v1/search/order, /utr                                (delegates to external UniReco service)

PRIMARY INDEXES:
None (no dedicated search index). One dormant MySQL FULLTEXT index on item_type.sku_code.
Standard relational tables/columns are queried live per request.

INDEXING MECHANISM:
Not applicable — no indexing pipeline exists. All search queries execute
directly against live MySQL data at request time.

CONFIDENCE:
High — for "no active dedicated search engine" (verified by absence of any
client/bean/query-execution code across all three main modules).
Medium — for completeness of the DB-search inventory (representative, not
exhaustive, given the "search-first" investigation constraint).
```
