import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import {
  blockDevice,
  blockIp,
  listBlockedIps,
  listDevices,
  unblockDevice,
  unblockIp,
  type BlockedIp,
  type Device,
} from '../../../api/security.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Can } from '../../../components/common/Can';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Modal } from '../../../components/common/Modal';
import { Textarea } from '../../../components/common/Textarea';
import { DataTable } from '../../../components/table/DataTable';
import { formatDateTime } from '../../../utils/format';
import { toast } from '../../../utils/toast';
import { RateLimitPoliciesSection } from '../components/RateLimitPoliciesSection';

function actorLabel(user: Device['userId']): string {
  if (!user) return 'Unknown';
  if (typeof user === 'string') return user;
  return user.name ?? user.email ?? user._id;
}

function EnforcedPolicyCard() {
  return (
    <Card className="border-l-4 border-l-brand-500 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enforced Policy</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Password policy: minimum 8 characters, must include an uppercase letter, a lowercase
        letter, and a digit.
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Account lockout: 5 failed login attempts locks the account for 15 minutes.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        JWT / refresh token / session expiry are managed under Configuration → Global.
      </p>
    </Card>
  );
}

function BlockedIpsSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState('');
  const limit = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['blocked-ips', page],
    queryFn: () => listBlockedIps({ page, limit }),
    placeholderData: (prev) => prev,
  });

  const blockMutation = useMutation({
    mutationFn: () => blockIp({ ipAddress, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] });
      toast.success('IP blocked');
      setShowModal(false);
      setIpAddress('');
      setReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => unblockIp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] });
      toast.success('IP unblocked');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: ColumnDef<BlockedIp, unknown>[] = [
    { accessorKey: 'ipAddress', header: 'IP Address' },
    { accessorKey: 'reason', header: 'Reason', enableSorting: false },
    {
      accessorKey: 'createdAt',
      header: 'Blocked At',
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Can I="update" a="audit_logs">
          <Button size="sm" variant="outline" onClick={() => unblockMutation.mutate(row.original._id)}>
            Unblock
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blocked IPs</h2>
        <Can I="update" a="audit_logs">
          <Button size="sm" onClick={() => setShowModal(true)}>
            Block an IP
          </Button>
        </Can>
      </div>
      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Block an IP address">
        <div className="flex flex-col gap-3">
          <Input
            label="IP Address"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="203.0.113.42"
          />
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <Button
            isLoading={blockMutation.isPending}
            disabled={!ipAddress.trim()}
            onClick={() => blockMutation.mutate()}
          >
            Block
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function BlockedDevicesSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['security-devices', page],
    queryFn: () => listDevices({ page, limit }),
    placeholderData: (prev) => prev,
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => blockDevice(id, 'Blocked by admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-devices'] });
      toast.success('Device blocked');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => unblockDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-devices'] });
      toast.success('Device unblocked');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: ColumnDef<Device, unknown>[] = [
    {
      accessorKey: 'userId',
      header: 'User',
      enableSorting: false,
      cell: ({ row }) => actorLabel(row.original.userId),
    },
    { accessorKey: 'platform', header: 'Platform', enableSorting: false },
    {
      accessorKey: 'deviceId',
      header: 'Device ID',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.deviceId.slice(-10)}</span>,
    },
    {
      accessorKey: 'lastActiveAt',
      header: 'Last Active',
      cell: ({ row }) => formatDateTime(row.original.lastActiveAt),
    },
    {
      accessorKey: 'isBlocked',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isBlocked ? (
          <Badge tone="red">Blocked</Badge>
        ) : (
          <Badge tone="green">Active</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Can I="update" a="audit_logs">
          {row.original.isBlocked ? (
            <Button size="sm" variant="outline" onClick={() => unblockMutation.mutate(row.original._id)}>
              Unblock
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => blockMutation.mutate(row.original._id)}>
              Block
            </Button>
          )}
        </Can>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blocked Devices</h2>
      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default function SecurityCenterPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Security Center</h1>
      <EnforcedPolicyCard />
      <RateLimitPoliciesSection />
      <BlockedIpsSection />
      <BlockedDevicesSection />
    </div>
  );
}
