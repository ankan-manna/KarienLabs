import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { brandApi, manufacturerApi } from '../../../api/catalog.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import { Checkbox } from '../../../components/common/Checkbox';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { Pagination } from '../../../components/common/Pagination';
import { SearchBar } from '../../../components/common/SearchBar';
import { Select } from '../../../components/common/Select';
import { SkeletonRows } from '../../../components/common/Skeleton';
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

function flattenCategories(nodes: { _id: string; name: string; children?: unknown[] }[], depth = 0): { _id: string; name: string; depth: number }[] {
  return nodes.flatMap((node) => [
    { _id: node._id, name: node.name, depth },
    ...flattenCategories((node.children as typeof nodes) ?? [], depth + 1),
  ]);
}

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
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
  const limit = 12;

  useDocumentMeta({
    title: 'Shop Products',
    description: 'Browse prescription and OTC medicines, health devices, and wellness products.',
  });

  const { data: categoryTree } = useQuery({ queryKey: ['categories', 'tree'], queryFn: listCategoryTree });
  const categories = useMemo(() => flattenCategories(categoryTree ?? []), [categoryTree]);
  const { data: brands } = useQuery({ queryKey: ['brands', 'public'], queryFn: () => brandApi.list({ limit: 100 }) });
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers', 'public'],
    queryFn: () => manufacturerApi.list({ limit: 100 }),
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
    setSearchParams(next, { replace: true });
  }

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Products</h1>
        <div className="w-64">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search products…"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-4">
          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              syncParam('categoryId', e.target.value);
            }}
            options={[
              { label: 'All Categories', value: '' },
              ...categories.map((c) => ({ label: `${'— '.repeat(c.depth)}${c.name}`, value: c._id })),
            ]}
          />
          <Select
            label="Brand"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              syncParam('brandId', e.target.value);
            }}
            options={[
              { label: 'All Brands', value: '' },
              ...(brands?.items ?? []).map((b) => ({ label: b.name, value: b._id })),
            ]}
          />
          <Select
            label="Manufacturer"
            value={manufacturerId}
            onChange={(e) => {
              setManufacturerId(e.target.value);
              syncParam('manufacturerId', e.target.value);
            }}
            options={[
              { label: 'All Manufacturers', value: '' },
              ...(manufacturers?.items ?? []).map((m) => ({ label: m.name, value: m._id })),
            ]}
          />

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Price range</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Min"
                value={priceMin}
                onChange={(e) => {
                  setPriceMin(e.target.value);
                  setPage(1);
                }}
              />
              <span className="text-gray-400">–</span>
              <Input
                type="number"
                min={0}
                placeholder="Max"
                value={priceMax}
                onChange={(e) => {
                  setPriceMax(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <Select
            label="Discount"
            value={minDiscountPct}
            onChange={(e) => {
              setMinDiscountPct(e.target.value);
              setPage(1);
            }}
            options={DISCOUNT_OPTIONS}
          />

          <Checkbox
            label="Prescription required"
            checked={prescriptionOnly}
            onChange={(e) => {
              setPrescriptionOnly(e.target.checked);
              setPage(1);
            }}
          />
          <Select
            label="Sort by"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={SORT_OPTIONS}
          />
        </aside>

        <div>
          {isLoading ? (
            <SkeletonRows rows={4} columns={3} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No products found" description="Try a different search or filter." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {data.items.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}

          {data && (
            <Pagination page={page} limit={limit} total={data.meta.total} onPageChange={setPage} />
          )}
        </div>
      </div>
    </div>
  );
}
