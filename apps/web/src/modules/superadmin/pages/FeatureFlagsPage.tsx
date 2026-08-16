import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_ROLES } from '@medcommerce/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createFeatureFlag,
  deleteFeatureFlag,
  listFeatureFlags,
  setFeatureFlagEnabled,
  updateFeatureFlag,
  type FeatureFlag,
} from '../../../api/super-admin.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Checkbox } from '../../../components/common/Checkbox';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { Modal } from '../../../components/common/Modal';
import { Select } from '../../../components/common/Select';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

const flagFormSchema = z.object({
  key: z.string().trim().min(1, 'Key is required'),
  enabled: z.boolean(),
  scope: z.enum(['global', 'role', 'user']),
  targetRoles: z.array(z.string()),
  targetUserIds: z.string(),
  rolloutPercentage: z.coerce.number().min(0).max(100),
});
type FlagFormValues = z.infer<typeof flagFormSchema>;

const DEFAULT_FORM_VALUES: FlagFormValues = {
  key: '',
  enabled: false,
  scope: 'global',
  targetRoles: [],
  targetUserIds: '',
  rolloutPercentage: 100,
};

function flagToFormValues(flag: FeatureFlag): FlagFormValues {
  return {
    key: flag.key,
    enabled: flag.enabled,
    scope: flag.scope,
    targetRoles: flag.targetRoles ?? [],
    targetUserIds: (flag.targetUserIds ?? []).join(', '),
    rolloutPercentage: flag.rolloutPercentage,
  };
}

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);

  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags', 'admin'],
    queryFn: listFeatureFlags,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feature-flags'] });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FlagFormValues>({
    resolver: zodResolver(flagFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const scope = watch('scope');
  const targetRoles = watch('targetRoles');

  useEffect(() => {
    reset(editingFlag ? flagToFormValues(editingFlag) : DEFAULT_FORM_VALUES);
  }, [editingFlag, reset, isModalOpen]);

  const saveMutation = useMutation({
    mutationFn: (values: FlagFormValues) => {
      const targetUserIds = values.targetUserIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const payload = {
        enabled: values.enabled,
        scope: values.scope,
        targetRoles: values.scope === 'role' ? values.targetRoles : [],
        targetUserIds: values.scope === 'user' ? targetUserIds : [],
        rolloutPercentage: values.rolloutPercentage,
      };
      return editingFlag
        ? updateFeatureFlag(editingFlag.key, payload)
        : createFeatureFlag({ key: values.key, ...payload });
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingFlag ? 'Flag updated' : 'Flag created');
      closeModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      setFeatureFlagEnabled(key, enabled),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFeatureFlag(key),
    onSuccess: invalidate,
  });

  function openCreateModal() {
    setEditingFlag(null);
    setIsModalOpen(true);
  }

  function openEditModal(flag: FeatureFlag) {
    setEditingFlag(flag);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingFlag(null);
  }

  function toggleTargetRole(role: string) {
    const current = new Set(targetRoles);
    if (current.has(role)) current.delete(role);
    else current.add(role);
    setValue('targetRoles', Array.from(current));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Feature Flags</h1>
        <Button onClick={openCreateModal}>New Flag</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={4} columns={3} />
          </div>
        ) : !flags || flags.length === 0 ? (
          <EmptyState title="No feature flags yet" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Key</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Scope</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Rollout</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Enabled</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.key} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 font-mono text-xs">{flag.key}</td>
                  <td className="px-4 py-2">
                    <Badge>{flag.scope}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={flag.rolloutPercentage >= 100 ? 'gray' : 'yellow'}>
                      {flag.rolloutPercentage}% rollout
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Switch
                      checked={flag.enabled}
                      onChange={(enabled) => toggleMutation.mutate({ key: flag.key, enabled })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => openEditModal(flag)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(flag.key)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingFlag ? `Edit ${editingFlag.key}` : 'New Feature Flag'}
        size="md"
      >
        <form
          onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <Input
            label="Key"
            placeholder="e.g. inventory.grn"
            disabled={!!editingFlag}
            error={errors.key?.message}
            {...register('key')}
          />

          <div className="flex items-center gap-2">
            <Switch
              checked={watch('enabled')}
              onChange={(enabled) => setValue('enabled', enabled)}
              label="Enabled"
            />
          </div>

          <Select
            label="Scope"
            options={[
              { label: 'Global', value: 'global' },
              { label: 'Role-based', value: 'role' },
              { label: 'User-based', value: 'user' },
            ]}
            {...register('scope')}
          />

          {scope === 'role' && (
            <div>
              <p className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Target roles
              </p>
              <div className="flex flex-col gap-1">
                {DEFAULT_ROLES.map((role) => (
                  <Checkbox
                    key={role}
                    label={role}
                    checked={targetRoles.includes(role)}
                    onChange={() => toggleTargetRole(role)}
                  />
                ))}
              </div>
            </div>
          )}

          {scope === 'user' && (
            <Input
              label="Target user IDs (comma-separated)"
              placeholder="64f..., 64a..."
              {...register('targetUserIds')}
            />
          )}

          <Input
            label="Rollout percentage"
            type="number"
            min={0}
            max={100}
            error={errors.rolloutPercentage?.message}
            {...register('rolloutPercentage')}
          />

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingFlag ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
