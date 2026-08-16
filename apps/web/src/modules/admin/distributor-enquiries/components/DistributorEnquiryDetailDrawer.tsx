import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { getAdminUser, updateAdminUser } from '../../../../api/super-admin.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { formatDateTime } from '../../../../utils/format';
import { roleLabel } from '../../../../utils/role-label';
import { toast } from '../../../../utils/toast';
import {
  useAdminDistributorEnquiry,
  useAssignDistributorEnquiry,
  useAssignableStaff,
  useAddDistributorEnquiryNote,
  useUpdateDistributorEnquiryStatus,
} from '../hooks/useAdminDistributorEnquiries';

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

/** Mirrors DISTRIBUTOR_ENQUIRY_STATUS_TRANSITIONS (packages/shared/src/constants/distributor-enquiry-events.ts) — the backend re-validates every transition regardless, this only avoids offering an option the backend would reject. */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ['in_review', 'rejected', 'closed'],
  in_review: ['contacted', 'rejected', 'closed'],
  contacted: ['negotiating', 'quoted', 'rejected', 'closed'],
  negotiating: ['quoted', 'contacted', 'rejected', 'closed'],
  quoted: ['negotiating', 'converted', 'rejected', 'closed'],
  converted: [],
  closed: [],
  rejected: [],
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  in_review: 'In Review',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  quoted: 'Quoted',
  converted: 'Converted',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function DistributorEnquiryDetailDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: enquiry, isLoading } = useAdminDistributorEnquiry(id);
  const { data: staff } = useAssignableStaff();
  const updateStatus = useUpdateDistributorEnquiryStatus();
  const assign = useAssignDistributorEnquiry();
  const addNote = useAddDistributorEnquiryNote();
  const [noteText, setNoteText] = useState('');
  const [confirmAssignDistributor, setConfirmAssignDistributor] = useState(false);
  const queryClient = useQueryClient();

  const nextStatuses = enquiry ? (STATUS_TRANSITIONS[enquiry.status] ?? []) : [];

  // Part 10 — "Distributor Request and Distributor role must remain
  // logically connected": this enquiry may or may not be tied to a
  // registered account (`userId` is null for a guest submission — see
  // distributor-enquiry.model.ts). Only fetched/shown when it is, and only
  // for an actor who could act on it anyway (`getAdminUser` is
  // `users:update`-gated, Super-Admin-only, same as the role-assignment
  // mutation below).
  const { data: linkedUser } = useQuery({
    queryKey: ['admin-user', enquiry?.userId],
    queryFn: () => getAdminUser(enquiry!.userId!),
    enabled: !!enquiry?.userId,
    retry: false,
  });

  const assignDistributorRole = useMutation({
    mutationFn: (userId: string) => updateAdminUser(userId, { role: 'distributor' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user', enquiry?.userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Distributor role assigned');
      setConfirmAssignDistributor(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setConfirmAssignDistributor(false);
    },
  });

  return (
    <Drawer
      isOpen={!!id}
      onClose={() => {
        onClose();
        setNoteText('');
      }}
      title={enquiry ? enquiry.enquiryNumber : 'Enquiry'}
      width="lg"
    >
      {isLoading || !enquiry ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[enquiry.status] ?? 'gray'}>{STATUS_LABEL[enquiry.status] ?? enquiry.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(enquiry.createdAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Company</p>
              <p className="text-gray-900 dark:text-gray-100">{enquiry.companyName}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Contact Person</p>
              <p className="text-gray-900 dark:text-gray-100">{enquiry.contactPerson}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Email</p>
              <p className="text-gray-900 dark:text-gray-100">{enquiry.email}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Mobile</p>
              <p className="text-gray-900 dark:text-gray-100">{enquiry.mobile}</p>
            </div>
            {enquiry.gstin && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">GSTIN</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">{enquiry.gstin}</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-gray-500 dark:text-gray-400">Business Address</p>
              <p className="text-gray-900 dark:text-gray-100">
                {enquiry.businessAddress}, {enquiry.city}, {enquiry.state} {enquiry.pincode}
              </p>
            </div>
            {enquiry.message && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Message</p>
                <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{enquiry.message}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Requested Products
            </h3>
            {enquiry.requestedProducts.length === 0 ? (
              <p className="text-sm text-gray-500">No specific products requested.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {enquiry.requestedProducts.map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1 dark:border-gray-800">
                    <span>
                      {p.nameSnapshot} <span className="font-mono text-xs text-gray-400">({p.skuSnapshot})</span>
                    </span>
                    <span className="font-medium">x {p.requestedQuantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Part 10 — connects this enquiry to Prompt 1's role-management
              work. Reuses the SAME PATCH /admin/rbac/users/:id endpoint and
              `users:update` permission AdminUsersPage's "Change Role"
              control uses — never auto-assigns the role, only offers a
              one-click shortcut once an admin has decided to. */}
          <Can I="update" a="users">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Registered Account
              </h3>
              {!enquiry.userId ? (
                <p className="text-sm text-gray-500">
                  Guest submission — not linked to a registered customer account.
                </p>
              ) : !linkedUser ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 p-3 dark:border-gray-800">
                  <div className="text-sm">
                    <p className="text-gray-900 dark:text-gray-100">{linkedUser.name}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {linkedUser.email} · Current role: <Badge tone="gray">{roleLabel(linkedUser.role)}</Badge>
                    </p>
                  </div>
                  {linkedUser.role === 'distributor' ? (
                    <Badge tone="green">Already a Distributor</Badge>
                  ) : linkedUser.role === 'customer' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAssignDistributor(true)}
                    >
                      Assign Distributor Role
                    </Button>
                  ) : (
                    <p className="text-xs text-gray-400">
                      This account is a staff account ({roleLabel(linkedUser.role)}) — role changes are
                      made from User Management.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Can>

          <Can I="update" a="distributor_enquiries">
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Manage</h3>

              {nextStatuses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === 'rejected' ? 'danger' : 'outline'}
                      isLoading={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: enquiry._id, status: s as never })}
                    >
                      Move to {STATUS_LABEL[s] ?? s}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">This enquiry is in a final state.</p>
              )}

              <Select
                label="Assign to"
                value={enquiry.assignedAdminId ?? ''}
                onChange={(e) => {
                  if (e.target.value) assign.mutate({ id: enquiry._id, adminUserId: e.target.value });
                }}
                placeholder="Unassigned"
                options={(staff ?? []).map((s) => ({ label: `${s.name} (${s.role})`, value: s._id }))}
              />

              <div>
                <Textarea
                  label="Add internal note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Internal note — never visible to the distributor..."
                  rows={2}
                />
                <Button
                  size="sm"
                  className="mt-2"
                  isLoading={addNote.isPending}
                  disabled={noteText.trim().length < 3}
                  onClick={() =>
                    addNote.mutate(
                      { id: enquiry._id, note: noteText.trim() },
                      { onSuccess: () => setNoteText('') },
                    )
                  }
                >
                  Add note
                </Button>
              </div>

              {enquiry.internalNotes.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {enquiry.internalNotes
                    .slice()
                    .reverse()
                    .map((n, i) => (
                      <li key={i} className="rounded bg-gray-50 p-2 text-sm dark:bg-gray-800">
                        <p className="text-gray-900 dark:text-gray-100">{n.note}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {n.authorName} · {formatDateTime(n.createdAt)}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </Can>

          <ConfirmDialog
            isOpen={confirmAssignDistributor}
            title="Assign Distributor role"
            message={
              linkedUser && (
                <p>
                  Change <span className="font-medium">{linkedUser.name}</span>&apos;s role from{' '}
                  <Badge tone="gray">{roleLabel(linkedUser.role)}</Badge> to{' '}
                  <Badge tone="green">Distributor</Badge>? They&apos;ll keep normal storefront/account
                  access — this does not grant any Admin Panel access.
                </p>
              )
            }
            confirmLabel="Assign Distributor Role"
            isLoading={assignDistributorRole.isPending}
            onConfirm={() => {
              if (enquiry.userId) assignDistributorRole.mutate(enquiry.userId);
            }}
            onCancel={() => setConfirmAssignDistributor(false)}
          />
        </div>
      )}
    </Drawer>
  );
}
