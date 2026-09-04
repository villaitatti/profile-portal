# I Tatti house style

The Profile Portal and Libra are two products of one institution. They should feel like
siblings, not twins: same type, same colour logic, same chrome, same motion vocabulary,
each with its own density and layout. This document records the shared decisions so a
change in one app can be mirrored in the other. The Libra copy lives at
`docs/house-style.md` in the Libra repository; keep the two in step.

## Type

- **Brandon Grotesque** (Adobe Fonts kit `prv7fdz`) for everything the user reads and
  operates: body, navigation, tables, forms, badges, buttons. Three fallback tiers sit
  underneath it in `packages/web/src/styles/fonts.css`, including a size-adjusted Open
  Sans so an unreachable Adobe does not change the apparent size of the interface.
- **Bodoni Moda** (self-hosted, optical-size axis) for titles only: page titles, section
  titles, dialog titles, the product name in the sidebar, and a person's name where it is
  the subject of a card. Never below about 15px; empty-state titles, table headers and
  labels stay on Brandon. Weight 700 in light mode, 600 in dark (a didone's hairlines
  bloom on dark and get eaten on light; the two are matched by eye).
- No tracked uppercase labels. Column headers, eyebrows, group labels and kickers are
  sentence case at a readable size. Brandon's small x-height makes 13px capitals read
  like 11px.
- Tabular figures in every table.

## Colour

- **Crimson `#ab192d` is the mark and the accent, never the action colour.** It appears
  on the logo, the active navigation icon, tab underlines, hairlines under section titles,
  links and focus rings. A crimson button next to a crimson "delete" would carry the same
  meaning to the eye.
- **Primary actions are anthracite `#1d252c`** in light mode and a light grey in dark
  mode. Destructive controls keep a visibly different red.
- Surfaces are cool greys derived from the brand light grey `#e5eaec`; ink is anthracite
  and its softer steps. Dark mode uses the same hues at low lightness.
- Status colours share one recipe (`tone-success`, `tone-warning`, `tone-danger`,
  `tone-info`, `tone-progress`, `tone-claimed`, `tone-brand`, `tone-neutral` in
  `globals.css`): same lightness and chroma, only the hue changes, so a row of mixed
  statuses reads as a set in both themes. Meaning colours for icons and text are
  `text-success`, `text-info`, `text-progress`, `text-warning-foreground`,
  `text-destructive`.

## Chrome

- Sidebar header: crimson tile with the product icon, product name in Bodoni, one-line
  descriptor in Brandon. The institution is named in the header, not the sidebar.
- Header: 56px, sidebar toggle and current section on the left, the inline SVG I Tatti
  wordmark centred (it follows the theme), language and theme controls on the right.
- Toasts bottom-right with a close button.
- Dialog and alert-dialog titles in Bodoni at 1.2rem; destructive confirm buttons use the
  tinted destructive variant.
- Buttons come from the shared Button component. No hand-rolled `bg-primary` links.

## Motion

- One cross-fade on navigation (View Transitions API, 180ms, `viewTransition` on router
  links). Dialogs, popovers and sheets animate in. Status pills transition their colour.
- No entrance stagger, no hover lift, no decorative gradients.
- Everything is off under the operating system's reduced-motion setting.
- Tokens: `--duration-instant` 120ms, `--duration-state` 240ms, `--duration-layout`
  360ms, `--ease-out-quart`, `--ease-out-expo`.

## Words

- Dates as `02 March 2026` / `02 marzo 2026`; timestamps append the 24-hour time after a
  comma.
- Sentence case everywhere. Buttons say what happens ("Save changes", not "Submit").

## Where the two apps differ on purpose

- Libra is a ledger: 22px root on desktop with grids one step smaller, navy as its
  product colour on filter chips and sort indicators, a year picker in the header.
- The Portal is a reading surface: 18px root, roomier cards, a max-width of 72rem, and
  the person or the application as the unit of content.
