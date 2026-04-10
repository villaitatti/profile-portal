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
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-muted-foreground">
        {icon || <Inbox className="h-12 w-12" />}
      </div>
      <h3 className="mb-2 text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      {description && <p className="mb-5 max-w-xl text-[0.95rem] leading-7 text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
