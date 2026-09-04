interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Standard page heading: Bodoni title, plain-language description, optional
 * actions. The serif is reserved for this level and for section/dialog
 * titles; everything below stays on Brandon Grotesque.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-heading text-[2.15rem] leading-[1.15] text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[1.05rem] leading-7 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 md:shrink-0">{actions}</div>}
    </div>
  );
}
