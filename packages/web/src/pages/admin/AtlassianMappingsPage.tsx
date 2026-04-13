import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
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
import { Plus, ArrowRight, Trash2, Info, Link as LinkIcon, Search } from 'lucide-react';

function Auth0Logo() {
  return (
    <svg className="h-4 w-4 inline-block mr-1" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.98 7.45L19.62 0H4.38L2.02 7.45c-1.31 4.14.46 8.69 4.2 10.77L12 21.5l5.78-3.28c3.74-2.08 5.51-6.63 4.2-10.77zM12 17.3l-5.78-3.28c-2.24-1.25-3.3-3.97-2.52-6.44L5.38 2h13.24l1.68 5.58c.78 2.47-.28 5.19-2.52 6.44L12 17.3z" />
    </svg>
  );
}

function AtlassianLogo() {
  return (
    <svg className="h-4 w-4 inline-block mr-1" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.12 11.08c-.2-.27-.53-.3-.72-.04L.64 21.15c-.18.27-.05.55.28.55h7.73c.17 0 .33-.1.42-.25.87-1.73.46-5.93-1.95-10.37zm4.87-9.53c-2.74 4.6-3.07 9.6-1.22 13.07l3.58 6.62c.1.15.26.25.44.25h7.73c.33 0 .47-.28.28-.55L12.72 1.51c-.19-.26-.53-.23-.73.04z" />
    </svg>
  );
}

const ATLASSIAN_ADMIN_GROUPS_URL = 'https://admin.atlassian.com/o/7j8d9220-k660-19jk-j9c1-jbba1kc9b2jd/groups';

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function AtlassianMappingsPage() {
  const { data: mappings, isLoading: mappingsLoading } = useMappings();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: groups, isLoading: groupsLoading } = useAtlassianGroups();
  const createMapping = useCreateMapping();
  const deleteMapping = useDeleteMapping();

  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [isNewGroup, setIsNewGroup] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleGroupMapping | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'auth0RoleName' | 'atlassianGroupName' | 'createdBy' | 'createdAt'>('auth0RoleName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredMappings = useMemo(() => {
    if (!mappings) return [];
    let result = [...mappings];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (m) =>
          m.auth0RoleName.toLowerCase().includes(q) ||
          m.atlassianGroupName.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'auth0RoleName':
          cmp = a.auth0RoleName.localeCompare(b.auth0RoleName);
          break;
        case 'atlassianGroupName':
          cmp = a.atlassianGroupName.localeCompare(b.atlassianGroupName);
          break;
        case 'createdBy':
          cmp = (a.createdBy || '').localeCompare(b.createdBy || '');
          break;
        case 'createdAt':
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [mappings, searchQuery, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

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

  if (mappingsLoading || rolesLoading || groupsLoading) return <AtlassianMappingsSkeleton />;

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
      <div className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Add New Mapping</h2>

        {/* Instructions */}
        <div className="mb-6 rounded-xl border border-border bg-secondary/45 p-5">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="space-y-2 text-[0.95rem] leading-7 text-muted-foreground">
              <p>
                Select a role from the Auth0 dropdown and a group from the Atlassian Cloud dropdown.
              </p>
              <p>
                If the group you need doesn't exist in the dropdown, type the name (no spaces) and click <strong>Create new: "[name]"</strong>. The group will be created during the next sync.
              </p>
              <p>
                You can view all existing groups in the{' '}
                <a
                  href={ATLASSIAN_ADMIN_GROUPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:no-underline"
                >
                  Atlassian Cloud admin
                </a>
                . Groups synced from Auth0 have a lock icon, while others were created manually. To sync an existing manually-created group, note its members, delete the group in Atlassian Cloud, create a new group from the form below, and sync users from the "Sync Users to Atlassian Cloud" page.
              </p>
            </div>
          </div>
        </div>

        {/* Form: horizontal layout */}
        <div className="max-w-2xl">
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <label className="mb-1.5 flex items-center text-[0.95rem] font-medium">
                <Auth0Logo /> Auth0 Role
              </label>
              <SearchableCombobox
                options={roleOptions}
                value={selectedRoleId}
                onSelect={handleRoleSelect}
                onClear={() => { setSelectedRoleId(''); setSelectedRoleName(''); }}
                placeholder="Select Auth0 role"
              />
            </div>

            <LinkIcon className="h-5 w-5 text-muted-foreground mb-2.5 flex-shrink-0" />

            <div className="flex-1">
              <label className="mb-1.5 flex items-center text-[0.95rem] font-medium">
                <AtlassianLogo /> Atlassian Group
              </label>
              <SearchableCombobox
                options={groupOptions}
                value={selectedGroupId ?? ''}
                displayValue={isNewGroup ? selectedGroupName : undefined}
                onSelect={handleGroupSelect}
                onClear={() => { setSelectedGroupId(null); setSelectedGroupName(''); setIsNewGroup(false); }}
                placeholder="Select Atlassian group"
                allowCreate
                onCreateNew={handleGroupCreateNew}
                disallowChars=" "
                emptyMessage="No groups found. Type to create a new one."
              />
            </div>
          </div>

          {isNewGroup && selectedGroupName && (
            <p className="mb-3 text-[0.82rem] italic text-muted-foreground">
              New group &ldquo;{selectedGroupName}&rdquo; will be created during sync.
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Mapping
          </button>
        </div>
      </div>

      {/* Card 2: Group Mappings */}
      <div className="rounded-2xl border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Group Mappings</h2>

        {!hasMappings ? (
          <p className="py-8 text-center text-[0.95rem] text-muted-foreground">
            No mappings configured. Use the form above to add your first mapping.
          </p>
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by Auth0 role or Atlassian group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border bg-background py-2.5 pl-10 pr-4 text-base outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {filteredMappings.length === 0 ? (
              <p className="py-8 text-center text-[0.95rem] text-muted-foreground">
                No mappings match &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.95rem]">
                  <thead>
                    <tr className="border-b text-left">
                      <SortHeader field="auth0RoleName" label="Auth0 Role" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortHeader field="atlassianGroupName" label="Atlassian Group" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Auth0 Role ID</th>
                      <th className="pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">Atlassian Group ID</th>
                      <SortHeader field="createdBy" label="Added By" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <SortHeader field="createdAt" label="Added On" current={sortField} dir={sortDir} onSort={toggleSort} />
                      <th className="w-12 pb-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map((m) => (
                      <tr key={m.id} className="border-b">
                        <td className="py-3">{m.auth0RoleName}</td>
                        <td className="py-3">{m.atlassianGroupName}</td>
                        <td className="py-3 text-[0.78rem] font-mono text-muted-foreground">{m.auth0RoleId}</td>
                        <td className="py-3 text-[0.78rem] font-mono text-muted-foreground">
                          {m.atlassianGroupId || <span className="italic">new (will be created)</span>}
                        </td>
                        <td className="py-3 text-[0.92rem] text-muted-foreground">{m.createdBy || '—'}</td>
                        <td className="whitespace-nowrap py-3 text-[0.92rem] text-muted-foreground">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
          </>
        )}

        {hasMappings && (
          <div className="mt-6 pt-4 border-t">
            <Link
              to="/admin/atlassian/sync"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Next: Sync Users
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

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

function SortHeader({
  field,
  label,
  current,
  dir,
  onSort,
}: {
  field: 'auth0RoleName' | 'atlassianGroupName' | 'createdBy' | 'createdAt';
  label: string;
  current: string;
  dir: 'asc' | 'desc';
  onSort: (field: 'auth0RoleName' | 'atlassianGroupName' | 'createdBy' | 'createdAt') => void;
}) {
  const active = current === field;
  return (
    <th className="pb-3 text-left">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex select-none items-center text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function AtlassianMappingsSkeleton() {
  return (
    <div className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-72 rounded-full" />
        <SkeletonBlock className="h-5 w-[36rem] max-w-full rounded-full" />
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <SkeletonBlock className="mb-5 h-7 w-44 rounded-full" />
        <div className="mb-6 rounded-xl border border-border bg-secondary/45 p-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-11/12 rounded-full" />
            <SkeletonBlock className="h-4 w-10/12 rounded-full" />
          </div>
        </div>
        <div className="max-w-2xl space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24 rounded-full" />
              <SkeletonBlock className="h-11 w-full rounded-md" />
            </div>
            <SkeletonBlock className="mb-3 h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-28 rounded-full" />
              <SkeletonBlock className="h-11 w-full rounded-md" />
            </div>
          </div>
          <SkeletonBlock className="h-10 w-36 rounded-full" />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <SkeletonBlock className="mb-5 h-7 w-40 rounded-full" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.1fr_1.1fr_1.2fr_1.2fr_0.8fr_0.8fr_40px] items-center gap-3 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
              {Array.from({ length: 7 }).map((__, cellIndex) => (
                <SkeletonBlock key={cellIndex} className="h-4 rounded-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
