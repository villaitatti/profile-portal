import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Command } from 'cmdk';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoles } from '@/api/roles';

interface RoleTagSelectProps {
  value: string[];
  onChange: (roles: string[]) => void;
}

export function RoleTagSelect({ value, onChange }: RoleTagSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: roles, isLoading } = useRoles();

  const trimmedSearch = search.trim().toLowerCase();

  const filteredRoles = (roles ?? []).filter(
    (role) =>
      !trimmedSearch ||
      role.name.toLowerCase().includes(trimmedSearch) ||
      role.description?.toLowerCase().includes(trimmedSearch)
  );

  const toggleRole = (roleName: string) => {
    if (value.includes(roleName)) {
      onChange(value.filter((r) => r !== roleName));
    } else {
      onChange([...value, roleName]);
      setSearch('');
    }
  };

  const removeRole = (roleName: string) => {
    onChange(value.filter((r) => r !== roleName));
  };

  return (
    <div className="space-y-2">
      {/* Selected role pills */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[0.78rem] font-medium text-primary"
            >
              {role}
              <button
                type="button"
                onClick={() => removeRole(role)}
                aria-label={t('admin.roles.remove', { role })}
                className="hover:bg-primary/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Combobox dropdown */}
      <Popover open={open} onOpenChange={(isOpen) => setOpen(isOpen)}>
        <PopoverTrigger
          render={
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className={cn(
                'flex w-full items-center justify-between rounded-md border bg-background px-3.5 py-2.5 text-[0.95rem] text-left',
                'hover:bg-accent/50 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
            />
          }
        >
          <span className="text-muted-foreground">
            {isLoading ? t('admin.roles.loading') : t('admin.roles.searchAndSelect')}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
        </PopoverTrigger>

        <PopoverContent
          className="block w-(--anchor-width) gap-0 rounded-md border p-0"
          sideOffset={4}
          align="start"
        >
            <Command shouldFilter={false}>
              <div className="flex items-center border-b px-3">
                <Command.Input
                  ref={inputRef}
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t('admin.roles.searchPlaceholder')}
                  className="flex h-10 w-full bg-transparent py-2 text-[0.95rem] outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="max-h-60 overflow-y-auto p-1">
                {filteredRoles.map((role) => {
                  const isSelected = value.includes(role.name);
                  return (
                    <Command.Item
                      key={role.id}
                      value={role.name}
                      onSelect={() => toggleRole(role.name)}
                      className="relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[0.95rem] outline-none hover:bg-accent aria-selected:bg-accent"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{role.name}</span>
                        {role.description && (
                          <span className="truncate text-[0.78rem] text-muted-foreground">
                            {role.description}
                          </span>
                        )}
                      </div>
                    </Command.Item>
                  );
                })}

                {trimmedSearch && filteredRoles.length === 0 && (
                  <div className="py-4 text-center text-[0.95rem] text-muted-foreground">
                    {t('admin.roles.noneFound')}
                  </div>
                )}
              </Command.List>
            </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
