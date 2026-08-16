import { useQuery } from '@tanstack/react-query';

import { dynamicMenuApi, type DynamicMenuItem } from '../../../api/dynamic-menu.api';
import { ConfigEntityPage, type ConfigField } from '../../../components/table/ConfigEntityPage';
import { dynamicMenuHooks } from '../hooks/useDynamicMenu';

/**
 * Dynamic Menu Engine admin surface — the backend-driven source of truth for
 * sidebar/topnav structure (spec: "everything should render dynamically from
 * backend configuration"). The live admin sidebar still reads from the static
 * apps/web/src/constants/menu.ts today (migrating the actual render path is a
 * separate, higher-risk change); this page is what makes DynamicMenu a real,
 * queryable, admin-editable system rather than an unused model — it's seeded
 * from the current menu.ts structure via `npm run seed:dynamic-menu`.
 */
export default function DynamicMenuPage() {
  const { data } = useQuery({
    queryKey: ['dynamic-menu', 'parent-options'],
    queryFn: () => dynamicMenuApi.list({ limit: 500 }),
  });

  const parentOptions = [
    { label: 'None (top-level)', value: '' },
    ...(data?.items ?? []).map((item: DynamicMenuItem) => ({ label: item.label, value: item._id })),
  ];

  const fields: ConfigField[] = [
    { name: 'key', label: 'Key', type: 'text', showInTable: true },
    { name: 'label', label: 'Label', type: 'text', showInTable: true },
    { name: 'icon', label: 'Icon', type: 'text', optional: true },
    { name: 'path', label: 'Path', type: 'text', optional: true, showInTable: true },
    {
      name: 'placement',
      label: 'Placement',
      type: 'select',
      options: [
        { label: 'Sidebar', value: 'sidebar' },
        { label: 'Top Navigation', value: 'topnav' },
      ],
      defaultValue: 'sidebar',
      showInTable: true,
    },
    {
      name: 'parentId',
      label: 'Parent',
      type: 'select',
      options: parentOptions,
      optional: true,
    },
    { name: 'order', label: 'Order', type: 'number', defaultValue: 0, showInTable: true },
    {
      name: 'requiredPermission',
      label: 'Required Permission (resource:action)',
      type: 'text',
      optional: true,
    },
    { name: 'requiredRole', label: 'Required Role', type: 'text', optional: true },
    { name: 'requiredFeatureFlag', label: 'Required Feature Flag', type: 'text', optional: true },
  ];

  return (
    <ConfigEntityPage<DynamicMenuItem>
      title="Dynamic Menu"
      resource="menus"
      hooks={dynamicMenuHooks}
      fields={fields}
      api={dynamicMenuApi}
      hasActiveToggle
    />
  );
}
