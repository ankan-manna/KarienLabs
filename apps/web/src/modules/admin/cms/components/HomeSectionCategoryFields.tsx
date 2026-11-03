import { useQuery } from '@tanstack/react-query';
import { useFormContext } from 'react-hook-form';

import { listCategoryTree } from '../../../../api/products-public.api';
import { Button } from '../../../../components/common/Button';
import { Select } from '../../../../components/common/Select';

interface CategoryNode {
  _id: string;
  name: string;
  children?: CategoryNode[];
}

function flatten(nodes: CategoryNode[]): { value: string; label: string }[] {
  return nodes.flatMap((n) => [{ value: n._id, label: n.name }, ...flatten(n.children ?? [])]);
}

/**
 * Prompt 4 — Best Sellers category-wise navigation. `categoryIds` on a
 * HomeSection is an ORDERED list — for `type: 'category_tabs'` this is the
 * tab list itself (first entry = default-active tab); for `type:
 * 'category_grid'` it's the grid's category set. Products are never picked
 * here — they're always resolved live from the real catalog per category
 * (see public-cms.routes.ts) so this field only ever references real,
 * existing Category documents, never duplicates product data.
 */
export function HomeSectionCategoryFields() {
  const { watch, setValue } = useFormContext<Record<string, unknown>>();
  const type = watch('type') as string | undefined;
  const categoryIds = (watch('categoryIds') as string[] | undefined) ?? [];

  const { data: tree } = useQuery({ queryKey: ['categories', 'tree', 'admin-picker'], queryFn: listCategoryTree });
  const options = flatten((tree as CategoryNode[]) ?? []);

  if (type !== 'category_tabs' && type !== 'category_grid') return null;

  function updateAt(index: number, value: string) {
    const next = [...categoryIds];
    next[index] = value;
    setValue('categoryIds', next, { shouldDirty: true });
  }

  function removeAt(index: number) {
    setValue(
      'categoryIds',
      categoryIds.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }

  function add() {
    const firstUnused = options.find((o) => !categoryIds.includes(o.value));
    setValue('categoryIds', [...categoryIds, firstUnused?.value ?? ''], { shouldDirty: true });
  }

  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {type === 'category_tabs' ? 'Category tabs (in order)' : 'Categories'}
      </h3>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {type === 'category_tabs'
          ? 'The first category is the default-active tab on page load. Products shown under each tab always come live from that category’s real catalog — nothing is duplicated here.'
          : 'Categories shown in this grid section.'}
      </p>
      {categoryIds.length === 0 && <p className="mb-2 text-xs text-gray-400">No categories selected yet.</p>}
      <div className="flex flex-col gap-2">
        {categoryIds.map((id, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-xs text-gray-400">{i + 1}.</span>
            <div className="flex-1">
              <Select
                value={id}
                options={options}
                placeholder="Select a category"
                onChange={(e) => updateAt(i, e.target.value)}
              />
            </div>
            <Button type="button" size="sm" variant="danger" onClick={() => removeAt(i)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={add}>
        + Add category
      </Button>
    </div>
  );
}
