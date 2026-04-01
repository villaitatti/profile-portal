import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = 'No items found',
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      {icon || <Inbox className="h-12 w-12 mb-4" />}
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && <p className="text-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
