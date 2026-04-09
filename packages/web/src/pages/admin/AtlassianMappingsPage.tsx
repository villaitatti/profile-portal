import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useRoles } from '@/api/roles';
import {
  useMappings,
  useCreateMapping,
  useDeleteMapping,
} from '@/api/sync';
import { Trash2, Plus, ArrowRight } from 'lucide-react';

export function AtlassianMappingsPage() {
  const { data: mappings, isLoading } = useMappings();
  const { data: roles } = useRoles();
  const createMapping = useCreateMapping();
  const deleteMapping = useDeleteMapping();

  const [newRoleId, setNewRoleId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const handleAdd = () => {
    const role = roles?.find((r) => r.id === newRoleId);
    if (!role || !newGroupName.trim()) return;
    createMapping.mutate({
      auth0RoleId: role.id,
      auth0RoleName: role.name,
      atlassianGroupName: newGroupName.trim(),
    });
    setNewRoleId('');
    setNewGroupName('');
  };

  if (isLoading) return <LoadingSpinner />;

  const hasMappings = mappings && mappings.length > 0;

  return (
    <div>
      <PageHeader
        title="Manage Group Mapping"
        description="Map Auth0 roles to Atlassian managed groups. Only mapped roles will be synced."
      />

      <div className="rounded-xl border bg-card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Auth0 Role</th>
                <th className="pb-2 font-medium">Atlassian Group</th>
                <th className="pb-2 font-medium">Group ID</th>
                <th className="pb-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {mappings?.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2">{m.auth0RoleName}</td>
                  <td className="py-2">{m.atlassianGroupName}</td>
                  <td className="py-2 text-muted-foreground text-xs font-mono">
                    {m.atlassianGroupId || <span className="italic">new (will be created)</span>}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => deleteMapping.mutate(m.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove mapping"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!hasMappings && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    No mappings configured. Add a mapping to start syncing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <select
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select Auth0 role...</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Atlassian group name"
            className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1"
          />
          <button
            onClick={handleAdd}
            disabled={!newRoleId || !newGroupName.trim() || createMapping.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

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
    </div>
  );
}
