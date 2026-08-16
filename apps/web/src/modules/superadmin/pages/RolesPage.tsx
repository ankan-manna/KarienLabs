import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  cloneRole,
  createRole,
  listPermissionCatalog,
  listRoles,
  updateRolePermissions,
  type Role,
} from '../../../api/super-admin.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Can } from '../../../components/common/Can';
import { Checkbox } from '../../../components/common/Checkbox';
import { Input } from '../../../components/common/Input';
import { Modal } from '../../../components/common/Modal';
import { Skeleton } from '../../../components/common/Skeleton';
import { downloadBlob } from '../../../utils/downloadBlob';
import { toast } from '../../../utils/toast';

export default function RolesPage() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [cloneSource, setCloneSource] = useState<Role | null>(null);
  const [cloneKey, setCloneKey] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: roles, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
  });
  const { data: catalog, isLoading: isLoadingCatalog } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: listPermissionCatalog,
  });

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: () => updateRolePermissions(selectedRole!.key, Array.from(draftPermissions)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role permissions updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cloneMutation = useMutation({
    mutationFn: () => cloneRole(cloneSource!.key, { key: cloneKey, name: cloneName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role cloned');
      setCloneSource(null);
      setCloneKey('');
      setCloneName('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleExport() {
    if (!roles || roles.length === 0) return;
    const payload = roles.map((r) => ({ key: r.key, name: r.name, permissions: r.permissions }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `roles-export-${Date.now()}.json`);
  }

  async function handleImportFile(file: File) {
    setIsImporting(true);
    try {
      const text = await file.text();
      const entries = JSON.parse(text) as { key: string; name: string; permissions?: string[] }[];
      let imported = 0;
      let skipped = 0;
      for (const entry of entries) {
        try {
          await createRole(entry);
          imported += 1;
        } catch {
          skipped += 1;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(`Imported ${imported} of ${entries.length} roles${skipped ? ` (${skipped} already existed)` : ''}`);
    } catch {
      toast.error('Invalid roles export file');
    } finally {
      setIsImporting(false);
    }
  }

  function openCloneModal(role: Role) {
    setCloneSource(role);
    setCloneKey(`${role.key}_copy`);
    setCloneName(`${role.name} (copy)`);
  }

  function selectRole(role: Role) {
    setSelectedRole(role);
    setDraftPermissions(new Set(role.permissions));
  }

  function toggle(key: string) {
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const resourceGroups = new Map<string, typeof catalog>();
  for (const entry of catalog ?? []) {
    if (!resourceGroups.has(entry.resource)) resourceGroups.set(entry.resource, []);
    resourceGroups.get(entry.resource)!.push(entry);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Roles &amp; Permissions
        </h1>
        <Can I="update" a="roles">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!roles?.length}>
              Export Roles
            </Button>
            <Button
              size="sm"
              variant="outline"
              isLoading={isImporting}
              onClick={() => importInputRef.current?.click()}
            >
              Import Roles
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>
        </Can>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-1">
          {isLoadingRoles ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            roles?.map((role) => (
              <div
                key={role.key}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  selectedRole?.key === role.key
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <button onClick={() => selectRole(role)} className="flex-1 text-left">
                  {role.name}
                  {role.isSystem && <Badge tone="gray">system</Badge>}
                </button>
                <Can I="update" a="roles">
                  <button
                    onClick={() => openCloneModal(role)}
                    className="ml-2 text-xs text-brand-600 hover:underline"
                  >
                    Clone
                  </button>
                </Can>
              </div>
            ))
          )}
        </div>

        {selectedRole ? (
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {selectedRole.name} permissions
              </h2>
              <Button
                size="sm"
                isLoading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save
              </Button>
            </div>
            {isLoadingCatalog ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(resourceGroups.entries()).map(([resource, entries]) => (
                  <div key={resource}>
                    <p className="mb-1 text-xs font-semibold uppercase text-gray-400">{resource}</p>
                    {entries?.map((entry) => (
                      <Checkbox
                        key={entry.key}
                        label={entry.action}
                        checked={draftPermissions.has(entry.key)}
                        onChange={() => toggle(entry.key)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Select a role to edit its permissions.</p>
        )}
      </div>

      <Modal
        isOpen={!!cloneSource}
        onClose={() => setCloneSource(null)}
        title={`Clone ${cloneSource?.name ?? 'role'}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloneSource(null)}>
              Cancel
            </Button>
            <Button
              isLoading={cloneMutation.isPending}
              disabled={!cloneKey.trim() || !cloneName.trim()}
              onClick={() => cloneMutation.mutate()}
            >
              Clone
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="New role key"
            value={cloneKey}
            onChange={(e) => setCloneKey(e.target.value)}
          />
          <Input
            label="New role name"
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
