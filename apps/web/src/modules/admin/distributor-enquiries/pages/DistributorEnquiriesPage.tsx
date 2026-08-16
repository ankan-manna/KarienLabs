import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { DistributorEnquiryListItem } from '../../../../api/admin-distributor-enquiries.api';
import { Badge } from '../../../../components/common/Badge';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDateTime } from '../../../../utils/format';
import { DistributorEnquiryDetailDrawer } from '../components/DistributorEnquiryDetailDrawer';
import { useAdminDistributorEnquiriesList } from '../hooks/useAdminDistributorEnquiries';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  new: 'blue',
  in_review: 'yellow',
  contacted: 'yellow',
  negotiating: 'yellow',
  quoted: 'blue',
  converted: 'green',
  closed: 'gray',
  rejected: 'red',
};

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'New', value: 'new' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Negotiating', value: 'negotiating' },
  { label: 'Quoted', value: 'quoted' },
  { label: 'Converted', value: 'converted' },
  { label: 'Closed', value: 'closed' },
  { label: 'Rejected', value: 'rejected' },
];

function summarizeProducts(enquiry: DistributorEnquiryListItem): string {
  if (enquiry.requestedProducts.length === 0) return '—';
  const first = enquiry.requestedProducts[0];
  const extra = enquiry.requestedProducts.length - 1;
  return `${first.nameSnapshot} x ${first.requestedQuantity}${extra > 0 ? ` +${extra} more` : ''}`;
}

const columns: ColumnDef<DistributorEnquiryListItem, unknown>[] = [
  {
    accessorKey: 'enquiryNumber',
    header: 'Enquiry ID',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.enquiryNumber}</span>,
  },
  { accessorKey: 'companyName', header: 'Company', enableSorting: false },
  { accessorKey: 'contactPerson', header: 'Contact Person', enableSorting: false },
  {
    id: 'products',
    header: 'Requested Products',
    enableSorting: false,
    cell: ({ row }) => <span className="text-sm">{summarizeProducts(row.original)}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status.replace('_', ' ')}</Badge>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
];

export default function DistributorEnquiriesPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 20;

  const filter: Record<string, string> = {};
  if (status) filter.status = status;
  if (dateFrom) filter.dateFrom = dateFrom;
  if (dateTo) filter.dateTo = dateTo;

  const { data, isLoading } = useAdminDistributorEnquiriesList({ page, limit, sort, search, filter });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Distributor / Bulk Purchase Enquiries
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          label="Search"
          placeholder="Company, contact, email, mobile, enquiry ID"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          options={STATUS_OPTIONS}
        />
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
        />
      </div>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedId(row._id)}
      />

      <DistributorEnquiryDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
