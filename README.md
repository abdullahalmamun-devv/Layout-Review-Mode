# Layout Review Mode

A small Chrome/Edge extension for client review meetings. It temporarily rearranges and hides sections on the **PuraMini staging homepage** without changing GitHub, Cloudflare, the database, APIs, or the deployed application.

## What it does

- Detects reviewable storefront sections from the rendered PuraMini homepage.
- Keeps the section list synchronized when dynamic sections such as Checkout mount later.
- Preserves the current review arrangement while rescanning the page.
- Reorders sections with drag and drop.
- Moves sections up/down with buttons as a keyboard-friendly fallback.
- Hides/shows individual sections.
- Highlights and scrolls to a section by clicking its name.
- Resets to the storefront's current natural layout.
- Copies the approved section order with stable section keys for handoff to a coding agent.
- Supports **Presentation mode**, which hides the control panel while preserving the temporary arrangement.
- Resets automatically when the webpage is refreshed.

## Safety model

The extension is intentionally limited to the staging origin and only enables editing on the root storefront route:

`https://staging.puramini.care/`

It refuses to edit routes such as `/privacy`, `/terms`, `/shipping`, `/returns`, `/contact`, and `/order-received/...`.

The extension does **not** save layout changes to the server. Reordering uses CSS Flexbox `order` on already-rendered section elements instead of physically moving React-owned DOM nodes. This keeps the review session isolated from the application's source code and backend state.

No layout state is written to `localStorage`, `sessionStorage`, `chrome.storage`, cookies, URLs, or PuraMini APIs.

## Dynamic section handling

PuraMini's Checkout can mount after the offers request completes, and other sections can be conditional. Layout Review Mode watches the storefront structure and reconciles newly mounted, removed, or replaced direct sections.

Existing operator choices are preserved where possible:

- current section order remains intact;
- hidden sections stay hidden;
- new sections are inserted near their natural source-order neighbours;
- stale element references are discarded.

Use **Rescan** to manually reconcile the current page without discarding the arrangement.

## Reset semantics

**Reset** restores the current storefront's natural section order and display state. If a section mounted after Review Mode was enabled, Reset still treats it as part of the current natural storefront.

**Reset + close** restores the layout and hides the review panel.

Refreshing the webpage starts a completely fresh review session.

## Install locally

1. Download or clone this repository.
2. Open Chrome/Edge extensions:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this repository folder (the folder containing `manifest.json`).
6. Open `https://staging.puramini.care/`.
7. Click the **Layout Review Mode** extension icon.

## Review workflow

1. Open the staging homepage and let the page begin loading.
2. Click the extension icon.
3. Drag section rows or use the Up/Down buttons to compare layouts.
4. Use **Hide** to temporarily remove a section from the visual flow.
5. Use **Rescan** if you want to explicitly reconcile dynamic sections; the arrangement is preserved.
6. Click a section name to scroll to/highlight it.
7. Choose **Presentation mode** to hide the controls and show the client a clean page.
8. Click the extension icon again to restore the panel without losing the arrangement.
9. Click **Copy order** when the client approves an arrangement.
10. Give the copied stable-key order to the coding agent for permanent implementation.
11. Refresh the webpage to discard all temporary changes.

If Checkout or Package Selector is hidden, related anchor/CTA demonstrations are temporarily not meaningful until that section is shown again.

## Important accessibility limitation

Layout Review Mode changes **visual Flexbox order only**. It intentionally does not change DOM source order, keyboard tab order, or screen-reader reading order.

That is acceptable for a temporary visual client review, but the final approved arrangement must be implemented later in the actual React source order and accessibility must be tested on that permanent implementation.

## Development

No build step or third-party runtime dependency is required.

```bash
npm test
npm run check
```

The automated suite covers stable PuraMini section identities, Trust/Evidence separation, late-section reconciliation, removed/replaced section handling, route restrictions, reordering utilities, and approved-order export.

A final unpacked-extension rehearsal in current Chrome/Edge is still recommended before a client meeting because native drag/drop, toolbar messaging, focus, clipboard permissions, and the actual staging DOM are browser acceptance concerns.

## Scope

This is deliberately a review tool, not a CMS or production page builder. It does not edit production, persist layouts, rewrite PuraMini content, repair storefront application bugs, or perform backend mutations.
