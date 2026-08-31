"use client"

// Generated shadcn primitive: keep it free of app-level dependencies (i18n,
// api, app config) so it can be regenerated. English fallbacks below match
// the stock component; consumers inject translated copy via props
// (sheetTitle/sheetDescription on <Sidebar>, aria-label/title on
// <SidebarRail> and <SidebarTrigger>).
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { PanelLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/lib/use-mobile"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export const SIDEBAR_STORAGE_KEY = "profile-portal:sidebar"
const SIDEBAR_WIDTH_STORAGE_KEY = "profile-portal:sidebar-width"
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3.25rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
// Drag-resize band for the rail. Deliberately narrow: the floor keeps every
// menu label fully readable — the widest string in either language ("Archivio
// e Impostazioni") plus row chrome measures ~223px — and the ceiling stops
// the nav eating the grids.
const SIDEBAR_WIDTH_MIN = 224
const SIDEBAR_WIDTH_MAX = 336

function clampSidebarWidth(px: number) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(px)))
}

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  /** Custom expanded width in px, null = the 16rem default. */
  width: number | null
  setWidth: (width: number | null) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // Internal state, remembered across visits via localStorage.
  const [_open, _setOpen] = React.useState(() => {
    if (typeof window === "undefined") return defaultOpen
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
      return stored === null ? defaultOpen : stored === "expanded"
    } catch {
      // Storage can be blocked by browser policy; the sidebar still works.
      return defaultOpen
    }
  })
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) setOpenProp(openState)
      else _setOpen(openState)
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, openState ? "expanded" : "collapsed")
      } catch {
        // Storage can be unavailable (private mode); the sidebar still works.
      }
    },
    [setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Rail-drag width, remembered across visits like the open state.
  const [width, _setWidth] = React.useState<number | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
      const parsed = stored === null ? Number.NaN : Number.parseInt(stored, 10)
      return Number.isNaN(parsed) ? null : clampSidebarWidth(parsed)
    } catch {
      return null
    }
  })
  const setWidth = React.useCallback((value: number | null) => {
    const next = value === null ? null : clampSidebarWidth(value)
    _setWidth(next)
    try {
      if (next === null) window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY)
      else window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next))
    } catch {
      // Storage can be unavailable (private mode); the width still holds for the session.
    }
  }, [])

  // Cmd/Ctrl+B toggles the sidebar, like in the reference shadcn implementation.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, width, setWidth }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, width, setWidth]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={{
          "--sidebar-width": width === null ? SIDEBAR_WIDTH : `${width}px`,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          ...style,
        } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  collapsible = "icon",
  sheetTitle = "Sidebar",
  sheetDescription = "Displays the mobile sidebar.",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  collapsible?: "offcanvas" | "icon" | "none"
  /** Screen-reader-only title for the mobile sheet; pass translated copy. */
  sheetTitle?: string
  /** Screen-reader-only description for the mobile sheet; pass translated copy. */
  sheetDescription?: string
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) gap-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>{sheetDescription}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
    >
      {/* Sidebar gap on desktop: reserves layout width while the real bar is fixed. */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[resizing]/sidebar-wrapper:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
          "group-data-[resizing]/sidebar-wrapper:transition-none",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          "group-data-[side=left]:border-r group-data-[side=left]:border-sidebar-border",
          "group-data-[side=right]:border-l group-data-[side=right]:border-sidebar-border",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex h-full w-full flex-col bg-sidebar"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      {/* Fallback name only; consumers pass a translated aria-label, which wins. */}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

/**
 * The rail both toggles (click) and resizes (drag) the expanded sidebar. The
 * drag writes --sidebar-width straight onto the wrapper element so the width
 * tracks the pointer without a React render per mousemove; the final value is
 * committed (and persisted) on release. A drag past the 3px threshold
 * suppresses the click that follows it, so releasing a resize never collapses
 * the sidebar.
 */
type RailDrag = {
  pointerId: number
  startX: number
  startWidth: number
  wrapper: HTMLElement
  side: string
  dragged: boolean
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar, state, setWidth } = useSidebar()
  const drag = React.useRef<RailDrag | null>(null)
  const suppressClick = React.useRef(false)

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointerId) return
    drag.current = null
    active.wrapper.removeAttribute("data-resizing")
    if (active.dragged) {
      suppressClick.current = true
      const px = Number.parseInt(active.wrapper.style.getPropertyValue("--sidebar-width"), 10)
      if (!Number.isNaN(px)) setWidth(px)
    }
  }

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onPointerDown={(event) => {
        if (state !== "expanded" || event.button !== 0) return
        const wrapper = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-wrapper"]')
        const container = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-container"]')
        const side = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar"]')?.getAttribute("data-side") ?? "left"
        if (!wrapper || !container) return
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: container.getBoundingClientRect().width,
          wrapper,
          side,
          dragged: false,
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Capture is a nicety (keeps the drag when the pointer outruns the
          // 4px rail); a pointer type that refuses it still resizes fine.
        }
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || event.pointerId !== active.pointerId) return
        const delta = event.clientX - active.startX
        if (!active.dragged) {
          if (Math.abs(delta) < 3) return
          active.dragged = true
          // Presence of data-resizing turns off the 200ms width transition,
          // so the edge tracks the pointer instead of trailing it.
          active.wrapper.setAttribute("data-resizing", "true")
        }
        const next = clampSidebarWidth(active.startWidth + (active.side === "right" ? -delta : delta))
        active.wrapper.style.setProperty("--sidebar-width", `${next}px`)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          return
        }
        toggleSidebar()
      }}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex",
        // Expanded: the rail drags both ways, so the honest cursor is col-resize.
        "cursor-col-resize touch-none",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex min-w-0 w-full flex-1 flex-col bg-background", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-semibold tracking-wide text-sidebar-foreground/60 uppercase outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding,background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--color-sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--color-sidebar-accent)]",
      },
      size: {
        default: "h-9 text-sm",
        sm: "h-8 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  /** Base UI-style render prop: merges the button props onto the given element (e.g. a router link). */
  render?: React.ReactElement<Record<string, unknown>>
  isActive?: boolean
  tooltip?: string
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()

  const sharedProps = {
    "data-slot": "sidebar-menu-button",
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-active": isActive,
    ...props,
  }
  const classes = cn(sidebarMenuButtonVariants({ variant, size }), className)

  const button = render ? (
    React.cloneElement(render, {
      ...sharedProps,
      ...render.props,
      className: cn(classes, typeof render.props.className === "string" ? render.props.className : undefined),
      children,
    })
  ) : (
    <button {...sharedProps} className={classes}>
      {children}
    </button>
  )

  // The tooltip only matters when the rail is collapsed to icons on desktop.
  if (!tooltip || isMobile || state !== "collapsed") return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" align="center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
