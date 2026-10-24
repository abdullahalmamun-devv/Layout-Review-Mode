# Layout Review Mode

A small Chrome/Edge extension for client review meetings. It temporarily rearranges and hides sections on the **PuraMini staging storefront** without changing GitHub, Cloudflare, the database, APIs, or the deployed application.

## What it does

- Detects the storefront's reviewable sections from the rendered page.
- Reorders sections with drag and drop.
- Moves sections up/down with buttons as a fallback.
- Hides/shows individual sections.
- Highlights and scrolls to a section by clicking its name.
- Resets to the original layout.
- Copies the current approved section order as plain text.
- Supports a **Presentation mode** that hides the control panel while keeping the temporary arrangement visible.
- Resets automatically when the page is refreshed.

## Safety model

The extension is intentionally limited to:

`https://staging.puramini.care/*`

It does **not** save layout changes to the server. Reordering uses CSS Flexbox `order` on the already-rendered section elements instead of moving React-owned DOM nodes. This keeps the review session isolated from the application's source code and backend state.

## Install locally

1. Download or clone this repository.
2. Open Chrome/Edge extensions:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this repository folder (the folder containing `manifest.json`).
6. Open `https://staging.puramini.care`.
7. Click the **Layout Review Mode** extension icon.

## Review workflow

1. Open the staging storefront and wait for it to finish loading.
2. Click the extension icon.
3. Drag section rows in the floating panel to test alternative layouts.
4. Use **Hide** to temporarily remove a section from the visual flow.
5. Click a section name to scroll to/highlight it.
6. Choose **Presentation mode** to hide the controls and show the client a clean page.
7. Click the extension icon again to restore the panel.
8. Click **Copy order** when the client approves an arrangement.
9. Give the copied order to the coding agent for permanent implementation.
10. Refresh the webpage to discard all temporary changes.

## Development

No build step or third-party runtime dependencies are required.

```bash
npm test
npm run check
```

## Scope

This first version is deliberately a review tool, not a CMS or page builder. It does not edit production, persist layouts, rewrite page content, or perform backend mutations.
