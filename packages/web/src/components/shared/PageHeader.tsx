interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[1.05rem] leading-7 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 md:shrink-0">{actions}</div>}
    </div>
  );
}
