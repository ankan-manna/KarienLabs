import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { brandApi, manufacturerApi } from '../../../api/catalog.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import { Button } from '../../../components/common/Button';
import { Checkbox } from '../../../components/common/Checkbox';
import { Drawer } from '../../../components/common/Drawer';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { Pagination } from '../../../components/common/Pagination';
import { SearchBar } from '../../../components/common/SearchBar';
import { Select } from '../../../components/common/Select';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDebounce } from '../../../hooks/useDebounce';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackViewItemList } from '../../../lib/analytics';
import { ProductCard } from '../components/ProductCard';

const SORT_OPTIONS = [
  { label: 'Newest', value: '-createdAt' },
  { label: 'Price: Low to High', value: 'basePrice' },
  { label: 'Price: High to Low', value: '-basePrice' },
  { label: 'Popularity', value: '-ratingCount' },
  { label: 'Top Rated', value: '-ratingAvg' },
  { label: 'Name: A-Z', value: 'name' },
];

const DISCOUNT_OPTIONS = [
  { label: 'Any discount', value: '' },
  { label: '10% off or more', value: '10' },
  { label: '20% off or more', value: '20' },
  { label: '30% off or more', value: '30' },
  { label: '50% off or more', value: '50' },
];

interface CategoryNode {
  _id: string;
  name: string;
  description?: string;
  children?: unknown[];
}

function flattenCategories(nodes: CategoryNode[], depth = 0): { _id: string; name: string; depth: number }[] {
  return nodes.flatMap((node) => [
    { _id: node._id, name: node.name, depth },
    ...flattenCategories((node.children as CategoryNode[]) ?? [], depth + 1),
  ]);
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebounce(search, 400);
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '');
  const [brandId, setBrandId] = useState(searchParams.get('brandId') ?? '');
  const [manufacturerId, setManufacturerId] = useState(searchParams.get('manufacturerId') ?? '');
  const [prescriptionOnly, setPrescriptionOnly] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const debouncedPriceMin = useDebounce(priceMin, 400);
  const debouncedPriceMax = useDebounce(priceMax, 400);
  const [minDiscountPct, setMinDiscountPct] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const limit = 12;

  const { data: categoryTree } = useQuery({ queryKey: ['categories', 'tree'], queryFn: listCategoryTree });
  const categories = useMemo(() => flattenCategories(categoryTree ?? []), [categoryTree]);
  const activeCategory = useMemo(
    () => categories.find((c) => c._id === categoryId),
    [categories, categoryId],
  );
  // Looked up from the raw (nested) tree, not the flattened list, since only
  // the raw nodes carry `description` (flattenCategories only pulls
  // name/depth — the description isn't invented, it's whatever the admin set
  // on the category, rendered only when actually present).
  const activeCategoryDescription = useMemo(() => {
    if (!categoryId || !categoryTree) return undefined;
    const find = (nodes: CategoryNode[]): string | undefined => {
      for (const n of nodes) {
        if (n._id === categoryId) return n.description;
        const found = find((n.children as CategoryNode[]) ?? []);
        if (found) return found;
      }
      return undefined;
    };
    return find(categoryTree);
  }, [categoryId, categoryTree]);

  const { data: brands } = useQuery({ queryKey: ['brands', 'public'], queryFn: () => brandApi.list({ limit: 100 }) });
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers', 'public'],
    queryFn: () => manufacturerApi.list({ limit: 100 }),
  });
  const activeBrand = brands?.items.find((b) => b._id === brandId);
  const activeManufacturer = manufacturers?.items.find((m) => m._id === manufacturerId);

  const pageTitle = activeCategory ? activeCategory.name : search ? `Search: ${search}` : 'All Products';
  const pageDescription =
    activeCategoryDescription ||
    (activeCategory
      ? `Shop ${activeCategory.name} online — genuine products, fast delivery, secure checkout.`
      : 'Browse prescription and OTC medicines, health devices, and wellness products from verified brands.');

  useDocumentMeta({
    title: pageTitle,
    description: pageDescription,
  });

  const filter = useMemo(() => {
    const f: Record<string, string> = {};
    if (categoryId) f.categoryId = categoryId;
    if (brandId) f.brandId = brandId;
    if (manufacturerId) f.manufacturerId = manufacturerId;
    if (prescriptionOnly) f['medicine.prescriptionRequired'] = 'true';
    if (debouncedPriceMin) f.priceMin = debouncedPriceMin;
    if (debouncedPriceMax) f.priceMax = debouncedPriceMax;
    if (minDiscountPct) f.minDiscountPct = minDiscountPct;
    return f;
  }, [categoryId, brandId, manufacturerId, prescriptionOnly, debouncedPriceMin, debouncedPriceMax, minDiscountPct]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', page, debouncedSearch, filter, sort],
    queryFn: () => listProducts({ page, limit, search: debouncedSearch || undefined, filter, sort }),
    placeholderData: (prev) => prev,
  });

  function syncParam(key: string, value: string) {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function goToPage(next: number) {
    setPage(next);
    const params = new URLSearchParams(searchParams);
    if (next > 1) params.set('page', String(next));
    else params.delete('page');
    setSearchParams(params, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearAllFilters() {
    setCategoryId('');
    setBrandId('');
    setManufacturerId('');
    setPrescriptionOnly(false);
    setPriceMin('');
    setPriceMax('');
    setMinDiscountPct('');
    setPage(1);
    setSearchParams(new URLSearchParams(debouncedSearch ? { q: debouncedSearch } : {}), { replace: true });
  }

  const activeFilterChips = [
    categoryId && activeCategory
      ? { key: 'categoryId', label: activeCategory.name, clear: () => { setCategoryId(''); syncParam('categoryId', ''); } }
      : null,
    brandId && activeBrand
      ? { key: 'brandId', label: activeBrand.name, clear: () => { setBrandId(''); syncParam('brandId', ''); } }
      : null,
    manufacturerId && activeManufacturer
      ? {
          key: 'manufacturerId',
          label: activeManufacturer.name,
          clear: () => { setManufacturerId(''); syncParam('manufacturerId', ''); },
        }
      : null,
    priceMin || priceMax
      ? {
          key: 'price',
          label: `₹${priceMin || '0'} – ₹${priceMax || '∞'}`,
          clear: () => { setPriceMin(''); setPriceMax(''); },
        }
      : null,
    minDiscountPct
      ? {
          key: 'discount',
          label: `${minDiscountPct}% off or more`,
          clear: () => setMinDiscountPct(''),
        }
      : null,
    prescriptionOnly
      ? { key: 'rx', label: 'Prescription required', clear: () => setPrescriptionOnly(false) }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  // Keeps the search box's `q` param in the URL in sync (bookmarkable/shareable
  // search results), mirroring how categoryId/brandId/manufacturerId already sync.
  // Runs off the debounced value so it doesn't spam a history entry per keystroke.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (data?.items.length) {
      trackViewItemList(
        data.items.map((p) => ({
          item_id: p._id,
          item_name: p.name,
          item_category: p.categoryId,
          price: p.basePrice,
        })),
        'Product List',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when the actual result set changes
  }, [data]);

  const filterBody = (
    <div className="flex flex-col gap-6">
      {activeFilterChips.length > 0 && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="self-start text-xs font-medium text-accent hover:underline"
        >
          Clear all filters
        </button>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink dark:text-night-text">Categories</h3>
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => { setCategoryId(''); syncParam('categoryId', ''); }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                !categoryId
                  ? 'bg-deep-teal font-medium text-primary dark:bg-night-elevated'
                  : 'text-gray-600 hover:bg-deep-teal dark:text-night-muted dark:hover:bg-night-elevated'
              }`}
            >
              All Categories
            </button>
          </li>
          {categories.map((c) => (
            <li key={c._id}>
              <button
                type="button"
                onClick={() => { setCategoryId(c._id); syncParam('categoryId', c._id); }}
                style={{ paddingLeft: `${8 + c.depth * 14}px` }}
                className={`block w-full rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${
                  categoryId === c._id
                    ? 'bg-deep-teal font-medium text-primary dark:bg-night-elevated'
                    : 'text-gray-600 hover:bg-deep-teal dark:text-night-muted dark:hover:bg-night-elevated'
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink dark:text-night-text">Price range</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={priceMin}
            onChange={(e) => { setPriceMin(e.target.value); setPage(1); }}
          />
          <span className="text-gray-400 dark:text-night-muted">–</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={priceMax}
            onChange={(e) => { setPriceMax(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <Select
        label="Brand"
        value={brandId}
        onChange={(e) => { setBrandId(e.target.value); syncParam('brandId', e.target.value); }}
        options={[{ label: 'All Brands', value: '' }, ...(brands?.items ?? []).map((b) => ({ label: b.name, value: b._id }))]}
      />
      <Select
        label="Manufacturer"
        value={manufacturerId}
        onChange={(e) => { setManufacturerId(e.target.value); syncParam('manufacturerId', e.target.value); }}
        options={[
          { label: 'All Manufacturers', value: '' },
          ...(manufacturers?.items ?? []).map((m) => ({ label: m.name, value: m._id })),
        ]}
      />
      <Select
        label="Discount"
        value={minDiscountPct}
        onChange={(e) => { setMinDiscountPct(e.target.value); setPage(1); }}
        options={DISCOUNT_OPTIONS}
      />
      <Checkbox
        label="Prescription required"
        checked={prescriptionOnly}
        onChange={(e) => { setPrescriptionOnly(e.target.checked); setPage(1); }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={
          activeCategory
            ? [{ label: 'Products', to: '/products' }, { label: activeCategory.name }]
            : [{ label: 'Products' }]
        }
      />

      <div className="flex flex-col gap-2 border-b border-pale-sage pb-4 dark:border-night-border sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
            {pageTitle}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-night-muted">{pageDescription}</p>
          {data && (
            <p className="mt-1 text-xs text-gray-400 dark:text-night-muted">
              {data.meta.total} {data.meta.total === 1 ? 'result' : 'results'}
            </p>
          )}
        </div>
        <div className="w-full sm:w-64">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search products…"
          />
        </div>
      </div>

      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1.5 rounded-full border border-pale-sage bg-white px-3 py-1 text-xs font-medium text-ink hover:border-accent dark:border-night-border dark:bg-night-surface dark:text-night-text"
            >
              {chip.label}
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-gray-400 dark:text-night-muted" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Mobile filter/sort trigger row — desktop gets the persistent sidebar below instead */}
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="teal" size="sm" onClick={() => setMobileFiltersOpen(true)} className="flex-1">
          <span className="flex items-center justify-center gap-1.5">
            <FilterIcon />
            Filters{activeFilterChips.length > 0 ? ` (${activeFilterChips.length})` : ''}
          </span>
        </Button>
        <div className="flex-1">
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={SORT_OPTIONS}
            aria-label="Sort by"
          />
        </div>
      </div>

      <Drawer isOpen={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="Filters" width="sm">
        {filterBody}
      </Drawer>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
        <aside className="hidden md:block">{filterBody}</aside>

        <div>
          <div className="mb-3 hidden items-center justify-end md:flex">
            <Select
              label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              options={SORT_OPTIONS}
              className="w-56"
            />
          </div>

          {isLoading && !data ? (
            <SkeletonRows rows={4} columns={4} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title="No products found"
              description="Try a different search or filter."
              action={
                activeFilterChips.length > 0 || search ? (
                  <Button variant="teal" size="sm" onClick={() => { clearAllFilters(); setSearch(''); }}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.items.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}

          {data && data.items.length > 0 && (
            <Pagination page={page} limit={limit} total={data.meta.total} onPageChange={goToPage} />
          )}
        </div>
      </div>
    </div>
  );
}
