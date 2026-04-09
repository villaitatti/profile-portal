import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useRoles } from '@/api/roles';
import {
  useMappings,
  useCreateMapping,
  useDeleteMapping,
  useAtlassianGroups,
} from '@/api/sync';
import type { RoleGroupMapping } from '@/api/sync';
import { Plus, ArrowRight, Trash2 } from 'lucide-react';

export function AtlassianMappingsPage() {
  const { data: mappings, isLoading: mappingsLoading } = useMappings();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: groups, isLoading: groupsLoading } = useAtlassianGroups();
  const createMapping = useCreateMapping();
  const deleteMapping = useDeleteMapping();

  // Add form state
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [isNewGroup, setIsNewGroup] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<RoleGroupMapping | null>(null);

  const handleRoleSelect = (value: string, label: string) => {
    setSelectedRoleId(value);
    setSelectedRoleName(label);
  };

  const handleGroupSelect = (value: string, label: string) => {
    setSelectedGroupId(value);
    setSelectedGroupName(label);
    setIsNewGroup(false);
  };

  const handleGroupCreateNew = (name: string) => {
    setSelectedGroupId(null);
    setSelectedGroupName(name);
    setIsNewGroup(true);
  };

  const handleAdd = () => {
    if (!selectedRoleId || !selectedGroupName.trim()) return;
    createMapping.mutate(
      {
        auth0RoleId: selectedRoleId,
        auth0RoleName: selectedRoleName,
        atlassianGroupName: selectedGroupName.trim(),
        atlassianGroupId: selectedGroupId || undefined,
      },
      {
        onSuccess: () => {
          setSelectedRoleId('');
          setSelectedRoleName('');
          setSelectedGroupId(null);
          setSelectedGroupName('');
          setIsNewGroup(false);
        },
      }
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget || deleteMapping.isPending) return;
    deleteMapping.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  if (mappingsLoading || rolesLoading || groupsLoading) return <LoadingSpinner />;

  const hasMappings = Array.isArray(mappings) && mappings.length > 0;

  const roleOptions = (roles ?? []).map((r) => ({
    value: r.id,
    label: r.name,
  }));

  const groupOptions = (groups ?? []).map((g) => ({
    value: g.id,
    label: g.displayName,
  }));

  const canAdd = selectedRoleId && selectedGroupName.trim() && !createMapping.isPending;

  return (
    <div>
      <PageHeader
        title="Manage Group Mapping"
        description="Map Auth0 roles to Atlassian managed groups. Only mapped roles will be synced."
      />

      {/* Card 1: Add New Mapping */}
      <div className="rounded-xl border bg-card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add New Mapping</h2>
        <div className="max-w-xl space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Auth0 Role</label>
            <SearchableCombobox
              options={roleOptions}
              value={selectedRoleId}
              onSelect={handleRoleSelect}
              onClear={() => { setSelectedRoleId(''); setSelectedRoleName(''); }}
              placeholder="Select Auth0 role"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Atlassian Group</label>
            <SearchableCombobox
              options={groupOptions}
              value={selectedGroupId ?? ''}
              onSelect={handleGroupSelect}
              onClear={() => { setSelectedGroupId(null); setSelectedGroupName(''); setIsNewGroup(false); }}
              placeholder="Select Atlassian group"
              allowCreate
              onCreateNew={handleGroupCreateNew}
              emptyMessage="No groups found. Type to create a new one."
            />
            {isNewGroup && selectedGroupName && (
              <p className="mt-1 text-xs text-muted-foreground italic">
                New group &ldquo;{selectedGroupName}&rdquo; will be created during sync.
              </p>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Mapping
          </button>
        </div>
      </div>

      {/* Card 2: Group Mappings */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Group Mappings</h2>

        {!hasMappings ? (
          <p className="text-center py-8 text-muted-foreground">
            No mappings configured. Use the form above to add your first mapping.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Auth0 Role</th>
                  <th className="pb-2 font-medium">Atlassian Group</th>
                  <th className="pb-2 font-medium">Auth0 Role ID</th>
                  <th className="pb-2 font-medium">Atlassian Group ID</th>
                  <th className="pb-2 font-medium">Added By</th>
                  <th className="pb-2 font-medium">Added On</th>
                  <th className="pb-2 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {mappings!.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2">{m.auth0RoleName}</td>
                    <td className="py-2">{m.atlassianGroupName}</td>
                    <td className="py-2 text-xs font-mono text-muted-foreground">{m.auth0RoleId}</td>
                    <td className="py-2 text-xs font-mono text-muted-foreground">
                      {m.atlassianGroupId || <span className="italic">new (will be created)</span>}
                    </td>
                    <td className="py-2 text-sm text-muted-foreground">{m.createdBy || '—'}</td>
                    <td className="py-2 text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove mapping"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMappings && (
          <div className="mt-6 pt-4 border-t">
            <Link
              to="/admin/atlassian/sync"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Next: Sync Users
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Mapping"
        description={
          deleteTarget
            ? `Delete this mapping? Auth0 role "${deleteTarget.auth0RoleName}" will no longer sync to Atlassian group "${deleteTarget.atlassianGroupName}".`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
