import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
  type Address,
} from '../../../api/addresses.api';
import { MobileVerifyPanel } from '../../../components/address/MobileVerifyPanel';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Checkbox } from '../../../components/common/Checkbox';
import { Drawer } from '../../../components/common/Drawer';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { toast } from '../../../utils/toast';
import { addressFormSchema, type AddressFormValues } from '../../../validators/address.validators';

export default function AddressesPage() {
  // Part 4/23 — when checkout sends the customer here (no saved address, or
  // an address that needs verification), `location.state.from` carries the
  // path to return to. Plain client-side navigation, no new routing system.
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = (location.state as { from?: string } | null)?.from ?? null;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: listAddresses,
  });

  // Part 3 — checkout's "Add Address" CTA sends the customer straight here
  // with zero addresses; open the create form immediately instead of
  // making them find/click "Add Address" again on a page they didn't ask
  // to browse.
  useEffect(() => {
    if (returnTo && !isLoading && addresses && addresses.length === 0) {
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the address list first resolves empty, not on every render
  }, [isLoading, addresses]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues>({ resolver: zodResolver(addressFormSchema) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const createMutation = useMutation({
    mutationFn: (values: AddressFormValues) => createAddress({ ...values, type: 'both' }),
    onSuccess: () => {
      invalidate();
      toast.success('Address added');
      setIsFormOpen(false);
      // Part 4/23 — "Save Address → return to Checkout". `invalidate()`
      // above already refreshes the shared `['addresses']` cache entry the
      // checkout page reads, so it sees the new address immediately on
      // return — no refresh/re-login needed.
      if (returnTo) navigate(returnTo);
    },
    // Surfaces backend rejections a client-side schema can't catch — most
    // notably the Postal PIN Code cross-check (e.g. "this pincode belongs to
    // a different state") — as a toast rather than failing silently.
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (values: AddressFormValues) => updateAddress(editing!._id, values),
    onSuccess: () => {
      invalidate();
      toast.success('Address updated');
      setIsFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditing(null);
    reset({ label: 'Home', line1: '', city: '', state: '', pincode: '', phone: '' });
    setIsFormOpen(true);
  }

  function openEdit(address: Address) {
    setEditing(address);
    reset(address);
    setIsFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {returnTo && (
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="w-fit text-sm font-medium text-brand-600 hover:underline"
        >
          &larr; Back to checkout
        </button>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Addresses</h1>
        <Button onClick={openCreate}>Add Address</Button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} columns={1} />
      ) : !addresses || addresses.length === 0 ? (
        <EmptyState title="No addresses saved yet" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address._id} className="p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {address.label}
                </span>
                {address.isDefault && <Badge tone="blue">Default</Badge>}
                <Badge tone={address.pincodeVerified ? 'green' : 'gray'}>
                  {address.pincodeVerified ? 'Pincode verified' : 'Pincode unverified'}
                </Badge>
                <Badge tone={address.mobileVerified ? 'green' : 'yellow'}>
                  {address.mobileVerified ? 'Phone verified' : 'Phone unverified'}
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                {address.line1}, {address.city}, {address.state} {address.pincode}
              </p>
              <p className="text-sm text-gray-500">{address.phone}</p>
              <div className="mt-3 flex gap-3 text-xs">
                <button
                  onClick={() => openEdit(address)}
                  className="text-brand-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteMutation.mutate(address._id)}
                  className="text-red-500 hover:underline"
                >
                  Delete
                </button>
                {!address.mobileVerified && verifyingId !== address._id && (
                  <button
                    onClick={() => setVerifyingId(address._id)}
                    className="text-brand-600 hover:underline"
                  >
                    Verify phone
                  </button>
                )}
              </div>
              {verifyingId === address._id && (
                <MobileVerifyPanel
                  address={address}
                  onDone={() => {
                    setVerifyingId(null);
                    invalidate();
                    if (returnTo) navigate(returnTo);
                  }}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <Drawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Edit Address' : 'New Address'}
      >
        <form
          onSubmit={handleSubmit((values) =>
            editing ? updateMutation.mutate(values) : createMutation.mutate(values),
          )}
          className="flex flex-col gap-4"
        >
          <Input label="Label" error={errors.label?.message} {...register('label')} />
          <Input label="Address line 1" error={errors.line1?.message} {...register('line1')} />
          <Input label="Address line 2 (optional)" {...register('line2')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" error={errors.city?.message} {...register('city')} />
            <Input label="State" error={errors.state?.message} {...register('state')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pincode" error={errors.pincode?.message} {...register('pincode')} />
            <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
          </div>
          <Checkbox label="Set as default" {...register('isDefault')} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
