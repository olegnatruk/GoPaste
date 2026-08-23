---
name: GoPaste Local Dashboard
description: A compact local reaction control desk built from chartreuse signals, green ink, and image-led work surfaces.
colors:
  canvas: "#f2f1e9"
  surface: "#fcfcf7"
  surface-raised: "#ffffff"
  surface-muted: "#e7ece5"
  ink: "#173123"
  ink-soft: "#516458"
  line: "#c9d1c8"
  signal-chartreuse: "#bdf45d"
  signal-chartreuse-hover: "#cdfa7d"
  signal-green: "#2c6a42"
  signal-ink: "#183622"
  danger: "#a53d35"
  danger-soft: "#f9e8e5"
  focus: "#30784a"
  dark-canvas: "#0c1510"
  dark-surface: "#121f17"
  dark-surface-raised: "#17271d"
  dark-surface-muted: "#203027"
  dark-ink: "#eef7ef"
  dark-ink-soft: "#afc0b3"
  dark-line: "#33453a"
  dark-signal-green: "#8dd43e"
  dark-signal-ink: "#142519"
  dark-danger: "#ffaaa2"
  dark-danger-soft: "#432825"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "clamp(2.1rem, 5vw, 4.5rem)"
    fontWeight: 680
    lineHeight: 0.98
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 720
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  control-compact: "7px"
  control: "8px"
  field: "9px"
  action: "10px"
  card: "12px"
  panel: "14px"
  pill: "999px"
spacing:
  micro: "0.25rem"
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  section: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-chartreuse}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0.65rem 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-chartreuse-hover}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0.65rem 1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0.65rem 1rem"
    height: "2.75rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "0.55rem 0.65rem"
    height: "2.55rem"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.35rem 0.6rem"
    height: "2rem"
  chip-active:
    backgroundColor: "{colors.signal-chartreuse}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.35rem 0.6rem"
    height: "2rem"
  media-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  tool-panel:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1.25rem"
---

# Design System: GoPaste Local Dashboard

## Overview

**Creative North Star: "The Local Reaction Control Desk"**

The GoPaste dashboard is an operational surface for a personal, on-device reaction library. It feels like a compact workbench rather than a generic administration suite: image records lead, controls stay close to the work, and chartreuse marks the live path through otherwise calm green and neutral fields.

The visual system balances high information density with direct hierarchy. Large Bricolage Grotesque statements orient the user; Manrope carries scanning, filtering, metadata, and status. Light and dark themes keep the same roles and contrast logic rather than becoming separate identities. The confirmed anti-reference is a generic admin-card dashboard with interchangeable tiles and decorative chrome.

**Key Characteristics:**

- Warm neutral or deep green fields with restrained tonal layering.
- Chartreuse used as an operational signal for active, selected, and primary states.
- Compact workhorse controls paired with large, compressed display headlines.
- Image-led media records, visible local-only language, and explicit destructive states.
- Responsive navigation that preserves all six dashboard destinations.

## Colors

The palette reads as garden-bright signal color on a practical archive desk: warm paper and forest ink in light mode, deep green work surfaces and pale mint ink in dark mode.

### Primary

- **Signal Chartreuse:** The unmistakable active-state color for primary actions, current navigation, selected filters, progress, and the overview's local-usage signal.
- **Working Green:** The quieter interactive color for links, checkboxes, progress, and selected borders; its dark-theme counterpart remains bright enough to read on deep surfaces.

### Secondary

- **Safety Red:** Reserved for deletion and failure language, with a soft companion surface where a danger treatment needs area.

### Neutral

- **Warm Archive Canvas:** The page field in light mode; raised and muted companions separate working regions without turning every region into a card.
- **Deep Local Green:** The page field in dark mode; neighboring green surfaces create depth while preserving the local, private atmosphere.
- **Forest Ink:** Primary text, hard borders, and dark bulk-action bars in light mode.
- **Pale Mint Ink:** Primary text and high-contrast controls in dark mode.
- **Soft Ink:** Supporting copy and metadata remain quieter but readable in each theme.
- **Utility Line:** Fine separators organize dense controls, statistics, and records in each theme.

### Named Rules

**The Signal, Not Wash Rule.** Chartreuse identifies a current choice, primary action, or meaningful local signal; do not use it as ambient decoration across every surface.

**The Theme Role Rule.** Theme changes swap canvas, surface, ink, line, danger, and focus roles together. Do not mix a light-theme surface with dark-theme text roles or vice versa.

## Typography

**Display Font:** Bricolage Grotesque Variable (with sans-serif fallback)  
**Body Font:** Manrope Variable (with sans-serif fallback)

**Character:** Bricolage Grotesque supplies compact personality and authority at the page, panel, metric, and media-title levels. Manrope keeps dense operational copy, metadata, controls, and status messages neutral and fast to scan.

### Hierarchy

- **Display** (680, `clamp(2.1rem, 5vw, 4.5rem)`, 0.98): Section-defining statements; keep the measure near 19 characters and use tight tracking.
- **Headline** (700, 1.3rem, 1.1): Panel headings and high-value subheads.
- **Title** (700, 0.92rem, 1.2): Media names and compact record titles, with truncation when space is constrained.
- **Body** (400, 0.92rem, 1.65): Section explanations and instructional copy, generally capped near 60 characters.
- **Label** (720, 0.7rem, 1.35): Controls, metadata labels, navigation, counts, and statuses; weights may rise to 760–820 for small high-priority actions.

### Named Rules

**The Two-Speed Rule.** Use Bricolage Grotesque to orient and Manrope to operate; do not let compact metadata compete with the display voice.

**The Dense Type Rule.** Small operational text earns clarity through weight and spacing, not uppercase everywhere; uppercase is limited to compact format abbreviations and navigation monograms.

## Layout

The desktop shell is a two-column operating frame with a persistent 16.5rem rail and a fluid main workspace. Sections center within an 86rem maximum and retain 2rem of side clearance at wide widths. The overview begins with a four-column border-separated metric band, then splits into a broad recent-media workspace and a narrower chartreuse signal panel. Tool pages use paired panels; the library toolbar and media grid carry the highest density.

At 1120px, tool pairs stack, the library filter toolbar reduces columns, and list records shed lower-priority metadata. At 860px, the rail collapses to 5rem, the section clearance tightens, metrics become two columns, and the overview stack becomes linear. At 640px, the rail becomes a fixed six-destination bottom navigation arranged in two rows, filters reflow to two columns, list records simplify, and bulk actions become a horizontally scrollable bar above navigation.

Spacing follows a compact 0.25rem–1.5rem control rhythm, with 3rem establishing section entry on desktop. One-pixel separators are structural and may replace extra containers when content already shares a surface.

### Named Rules

**The Rail Becomes Reachable Rule.** Preserve every destination while moving navigation from a persistent side rail to a thumb-reachable bottom bar on narrow screens.

**The Density Has Priority Rule.** Remove secondary metadata before shrinking controls below their established tap targets or forcing the primary work into horizontal page scroll.

## Elevation & Depth

The system is layered, not glossy. One-pixel borders and tonal surface changes establish most hierarchy; a low ambient shadow supports raised panels and media cards, while floating selection and drawer surfaces receive stronger directional shadows. Hover lift is limited to interactive cards and primary actions.

### Shadow Vocabulary

- **Ambient Panel** (`0 12px 32px -22px rgba(20, 48, 31, 0.5)`): Light-theme panels and media cards; present but visually subordinate to their border.
- **Ambient Panel, Dark** (`0 15px 38px -22px rgba(0, 0, 0, 0.9)`): Dark-theme replacement for the same role.
- **Floating Bulk Bar** (`0 18px 45px -18px rgba(5, 20, 11, 0.72)`): Separates the selection action bar from the library beneath it.
- **Side Drawer** (`-24px 0 60px -32px rgba(5, 20, 11, 0.7)`): Signals a temporary editing layer entering from the right.

### Named Rules

**The Workbench Layer Rule.** Borders and tonal shifts define resting hierarchy; reserve stronger shadows for layers that float, interrupt, or move over the workspace.

## Shapes

GoPaste uses gently tightened corners rather than either hard industrial rectangles or soft consumer bubbles. Compact controls sit between 7px and 10px; cards and preview frames use 12px; primary panels use 14px. Pills belong to tags, compact counts, progress, and charts. Media is clipped to stable 1:1, 4:3, or 16:10 frames according to density and context.

**The Tight Curve Rule.** Match radius to scale: small controls stay tighter than cards, and full pills are reserved for genuinely token-like or continuous elements.

## Components

The component philosophy is **compact, tactile, and explicit**: every control should advertise its current state without making the dashboard feel ornamental.

### Buttons

- **Shape:** Gently squared action corners (10px) with a one-pixel ink border and a 2.75rem minimum height.
- **Primary:** Signal Chartreuse with Signal Ink, compact bold label typography, and 0.65rem by 1rem padding.
- **Hover / Focus:** Primary hover brightens and lifts by 1px over 140ms; all keyboard focus uses a three-pixel visible outline with a three-pixel offset. Active returns to rest position.
- **Secondary / Ghost:** Secondary buttons retain the same border and shape on a transparent field, moving to a muted surface on hover. Text actions use Working Green and an offset underline.
- **Disabled:** Preserve the control shape while reducing opacity to 52% and removing the action cursor.

### Chips

- **Style:** Compact 2rem controls with an 8px radius, one-pixel Utility Line border, muted text, and transparent fill.
- **State:** Active chips invert to Signal Chartreuse and Signal Ink with a stronger border. Hash tags inside media records are smaller true pills on a muted surface.

### Cards / Containers

- **Corner Style:** Media cards use 12px corners; overview and tool panels use 14px corners.
- **Background:** Raised theme surface for working panels, muted surface for media wells and empty support areas, and Signal Chartreuse only for the designated local-signal panel.
- **Shadow Strategy:** Use the ambient panel shadow with a visible one-pixel border. Selected media receives a Working Green border plus a narrow chartreuse halo.
- **Internal Padding:** Media records use approximately 0.85rem; tool panels use 1.25rem; overview panels use approximately 1.35rem.

### Inputs / Fields

- **Style:** Theme surface fill, Utility Line stroke, 8–9px corners, compact label typography, and a 2.45–2.55rem minimum height.
- **Focus:** Use the global three-pixel Focus outline with three-pixel offset; retain the field border so geometry does not jump.
- **Error / Disabled:** Error and destructive semantics use Safety Red; disabled controls retain layout and reduce emphasis rather than disappearing.

### Navigation

The desktop rail uses six text destinations with compact boxed monograms. The active destination becomes a full-width chartreuse row with Signal Ink; inactive destinations use Soft Ink and a transparent field, gaining a muted hover surface. At 860px the rail keeps monograms only. At 640px the same six labels form a fixed two-row bottom bar, with the active label retaining the chartreuse state.

### Media Record

Media records lead with an image well and overlay selection and favorite controls at opposing top corners. The content region follows with title and format, up to three visible tags, compact source/date/size metadata, then a two-action row for use and details. Grid density changes the minimum column width and image aspect ratio; list mode exposes the same record in a horizontal scan pattern and progressively removes secondary detail on narrow screens.

### Bulk Action Bar

Selection creates a dark floating bar near the bottom of the library. It retains the number selected, reversible organization actions, link copying, and a distinctly red delete action. On mobile it sits above bottom navigation and scrolls horizontally rather than wrapping into an unstable overlay.

### Item Drawer

The editing drawer enters from the right at up to 28rem wide, pairs a full-height canvas with a dim scrim, and keeps preview, tags, categories, facts, save, and delete in one keyboard-contained layer. Escape and the scrim close it; focus moves into the drawer and returns to the prior control.

## Do's and Don'ts

### Do:

- **Do** use chartreuse for active navigation, selected filters, primary actions, and meaningful local signals.
- **Do** lead collection records with the saved image and keep title, tags, source, size, and date subordinate to it.
- **Do** preserve keyboard focus, semantic labels, aria state, and reduced-motion behavior across every operational control.
- **Do** keep local-only status visible in the rail and make backup, maintenance, and destructive scope explicit.
- **Do** simplify metadata and stack grids at established breakpoints while retaining complete task access.

### Don't:

- **Don't** turn the dashboard into a generic matrix of equal admin cards; use separators, image records, and a clear working region.
- **Don't** spread chartreuse across passive decoration or use color alone to communicate a destructive, selected, or current state.
- **Don't** introduce accounts, cloud sync, remote analytics, or remote AI language into this local extension surface.
- **Don't** auto-delete duplicate candidates or hide the scope of bulk deletion behind a vague confirmation.
- **Don't** replace the six dashboard destinations with an incomplete mobile menu or shrink controls to preserve desktop density.
