---
version: 1
slug: "dashboard-html"
primary_target: "dashboard.html"
related_targets:
  [
    "src/dashboard/DashboardShell.tsx",
    "src/dashboard/DashboardSections.tsx",
    "src/dashboard/dashboard.css",
  ]
---

# GoPaste Local Dashboard

## Scope and mode

- **Surface:** `dashboard.html` and its implementation under `src/dashboard/`.
- **Mode:** Operate.
- **Boundary:** The full-page local Chrome extension dashboard only. The popup remains the fast capture-and-sharing surface; this brief does not define cloud, account, or remote-service experiences.

## Audience and job

Individual Chrome users with a growing personal GIF and reaction-image library need to understand library health, find media quickly, organize many records, review local usage and duplicates, maintain storage safely, and move the collection through explicit ZIP archives.

## Primary tasks and content

- Move among Overview, Library, Categories & Tags, Insights, Maintenance, and Backup & Settings without losing the local-device context.
- Scan storage, favorites, recent saves, recent uses, and usage signals before entering deeper management work.
- Search and filter by metadata; switch grid/list modes and grid density; select records; batch favorite, tag, categorize, copy links, or delete.
- Edit an item in a keyboard-contained drawer; manage category/tag vocabulary; review local analytics, suggestions, and near-duplicate candidates; import/export explicit archives; change local preferences.
- Treat media previews, local metadata, counts, storage breakdowns, and user-confirmed maintenance candidates as the proof. Do not invent remote evidence or services.

## Direction

**The Local Reaction Control Desk.** GoPaste is not a generic admin-card dashboard. Chartreuse signals, deep green ink, warm neutral fields, compact workhorse controls, and image-led rows make the local library recognizable with content removed. The story moves from health and recent activity into retrieval, organization, review, safe cleanup, and user-controlled portability.

The memorable first viewport is a persistent left rail beside a high-density overview: a large orientation statement, border-separated library metrics, a broad recent-media work area, and one narrow chartreuse local-usage signal. On narrow screens, the rail becomes a complete two-row bottom navigation while the operational hierarchy remains intact.

## Constraints

- All processing, storage, search, analytics, suggestions, duplicate review, preferences, and archives remain on the device.
- Destructive bulk actions expose scope, require confirmation, and never remove near-duplicate candidates automatically.
- Preserve keyboard operation, visible focus, semantic labels, non-color-only feedback, reduced motion, longer text, and narrow-window usability.
- Support light, dark, and system theme preferences without changing the visual roles.

## Unresolved decisions

- None for the documented surface. Future capability changes must be reconciled with `PRODUCT.md` before this brief expands.
