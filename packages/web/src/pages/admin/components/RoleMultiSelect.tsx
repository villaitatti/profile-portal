import { useRoles } from '@/api/roles';
import { Loader2, X } from 'lucide-react';

interface RoleMultiSelectProps {
  value: string[];
  onChange: (roles: string[]) => void;
}

export function RoleMultiSelect({ value, onChange }: RoleMultiSelectProps) {
  const { data: roles, isLoading } = useRoles();

  const toggleRole = (roleName: string) => {
    if (value.includes(roleName)) {
      onChange(value.filter((r) => r !== roleName));
    } else {
      onChange([...value, roleName]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[0.95rem] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading roles...
      </div>
    );
  }

  return (
    <div>
      {/* Selected roles */}
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {value.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[0.78rem] font-medium text-primary"
            >
              {role}
              <button
                type="button"
                onClick={() => toggleRole(role)}
                className="hover:bg-primary/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Available roles */}
      <div className="max-h-48 overflow-y-auto rounded-md border">
        {roles?.map((role) => (
          <label
            key={role.id}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
          >
            <input
              type="checkbox"
              checked={value.includes(role.name)}
              onChange={() => toggleRole(role.name)}
              className="rounded border-input"
            />
            <div>
              <span className="text-[0.95rem] font-medium">{role.name}</span>
              {role.description && (
                <span className="ml-2 text-[0.78rem] text-muted-foreground">
                  {role.description}
                </span>
              )}
            </div>
          </label>
        ))}
        {(!roles || roles.length === 0) && (
          <p className="p-3 text-[0.95rem] text-muted-foreground">No roles available</p>
        )}
      </div>
    </div>
  );
}
