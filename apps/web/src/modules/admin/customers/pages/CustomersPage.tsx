import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { CustomerListItem } from '../../../../api/admin-customers.api';
import { Badge } from '../../../../components/common/Badge';
import { SearchBar } from '../../../../components/common/SearchBar';
import { DataTable } from '../../../../components/table/DataTable';
import { formatCurrency, formatDate } from '../../../../utils/format';
import { CustomerDetailDrawer } from '../components/CustomerDetailDrawer';
import { useCustomersList } from '../hooks/useAdminCustomers';

const columns: ColumnDef<CustomerListItem, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'orderCount', header: 'Orders', enableSorting: false },
  {
    accessorKey: 'totalSpent',
    header: 'Total Spent',
    enableSorting: false,
    cell: ({ row }) => formatCurrency(row.original.totalSpent),
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={row.original.isActive ? 'green' : 'gray'}>
        {row.original.isActive ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
];

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading } = useCustomersList({ page, limit, search: search || undefined });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Customers</h1>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedId(row._id)}
        toolbar={
          <SearchBar value={search} onChange={setSearch} placeholder="Search customers…" />
        }
      />

      <CustomerDetailDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
