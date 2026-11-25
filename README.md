# odata-ui

A `swagger-ui`-style explorer built natively for OData: metadata browser, interactive relationship diagram, visual query builder, paged results grid, and **OData Metadata Advisor** (helping API builders publish richer `$metadata`).

- **Live Demo & Docs (GitHub Pages)**: https://tiberriver256.github.io/odata-ui/
- **Goals, thoughts, and inspirations**: [NOTES.md](./NOTES.md)

## Drop-in Standalone Usage

```html
<div id="explorer" style="height: 85vh"></div>
<script src="odata-ui.standalone.js"></script>
<script>
  ODataUI({
    url: 'https://services.odata.org/TripPinRESTierService',
    dom_id: 'explorer',
    theme: 'auto',
  });
</script>
```

## Workspace Layout

| Package                                  | Description                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)       | Zero-runtime-dependency TypeScript core: v4 XML/JSON & v2/v3 XML CSDL parsers, Metadata Advisor, Query AST & URL printer, session-aware client, Shadow DOM UI, and standalone IIFE bundle (`globalThis.ODataUI`). |
| [`packages/react`](./packages/react)     | Thin React wrapper around `mount()`.                                                                                                                                                                              |
| [`packages/vue`](./packages/vue)         | Thin Vue 3 wrapper around `mount()`.                                                                                                                                                                              |
| [`packages/angular`](./packages/angular) | Explicit stub & standalone component sketch.                                                                                                                                                                      |
| [`packages/svelte`](./packages/svelte)   | Explicit stub & Svelte 5 component sketch.                                                                                                                                                                        |
| [`apps/demo`](./apps/demo)               | Vite live explorer + docs + Better OData Metadata guide (deployed to GitHub Pages).                                                                                                                               |

## Development

```bash
pnpm install
pnpm dev            # Run live explorer & docs locally
pnpm lint           # Lint with oxlint
pnpm format         # Format with oxfmt
pnpm typecheck      # Typecheck all packages (TypeScript 7)
pnpm test:run       # Run unit & Shadow DOM tests (Vitest)
pnpm build          # Build core (ESM + standalone IIFE + dts), React, Vue, and demo
```
