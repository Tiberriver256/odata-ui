# odata-ui Brand Kit & Design System

This document is the single source of truth for the visual identity, color architecture, typography, density, diagram grammar, and host-app theming contract of **`odata-ui`** (the `@odata-ui/core` Shadow DOM explorer and the `apps/demo` host application & documentation surfaces).

---

## 1. Brand Identity & Aesthetic Direction

### Core Aesthetic: Drafting Studio / Precision Mineral Instrument

`odata-ui` is an engineering instrument for people who inspect OData schemas, trace entity relationships, compose `$filter` / `$expand` / `$apply` queries, and audit CSDL metadata quality. Unlike OpenAPI operation lists, an OData service behaves like a queryable graph database; the interface should feel like a precision architectural drafting table rather than a marketing SaaS dashboard.

- **Operating Modes**:
  - **Operate Mode** (`@odata-ui/core` explorer + `apps/demo` single-row top bar): High information density, immediate scanability, crisp hairlines, zero decorative clutter. Color is strictly functional—it marks primary actions, current selection, entity keys, navigation edges, and diagnostic severity.
  - **Read Mode** (`apps/demo` `#docs` and `#metadata-guide` views): Editorial clarity (`65–75ch` prose measure, generous vertical spacing, hairline section breaks, high-legibility code blocks) sharing the exact same palette and typography.
- **Materiality**:
  - **Light Theme ("Drafting Vellum")**: Warm mineral stone neutrals (`OKLCH H ≈ 87–91°`, ultra-low chroma `C ≤ 0.015`) paired with deep graphite ink and a single authoritative **Verdigris Teal** accent (`H ≈ 189°`).
  - **Dark Theme ("Warm Obsidian Carbon")**: Drawn from the **exact same warm mineral hue family** (`OKLCH H ≈ 75–89°`, `C ≤ 0.018`)—eliminating the generic cool blue-slate cast (`#0f172a` / `#1e293b`) so Light and Dark feel like two lighting states of the same physical instrument.
- **Voice & Copy**:
  - Direct, terse, OData-native terminology (`EntitySet`, `NavigationProperty`, `$metadata`, `$expand`, `ContainsTarget`).
  - Controls name their exact action (`Load`, `Run Query`, `Upload XML`, `Fit`, `Headers`).
  - Errors state the failure and the concrete recovery step.

### Brand Mark & Wordmark Specification

The **`odata-ui`** mark represents an OData entity relationship graph: three rounded entity nodes arranged in an asymmetrical L-topology (root entity → linked entity → contained/nested entity) joined by orthogonal navigation connectors.

- **Canonical SVG Geometry (`24×24` viewBox, `2px` uniform stroke, `round` caps & joins)**:

```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="3" width="7" height="7" rx="1.5" />
  <rect x="14" y="3" width="7" height="7" rx="1.5" />
  <rect x="14" y="14" width="7" height="7" rx="1.5" />
  <path d="M10 6.5h4" />
  <path d="M17.5 10v4" />
</svg>
```

- **Mark Color & Sizing Rules**:
  - **Inline Header Lockup**: `18×18px`, colored with `--odata-ui-accent` (`#0A6661` light / `#35CBBF` dark), `7px` gap before wordmark.
  - **Minimum Size**: `16×16px` (`stroke-width: 2`). For `32×32px` favicons/app icons, place the mark centered with `20%` clearspace padding on `--odata-ui-bg` (light) or `--odata-ui-accent` with `--odata-ui-accent-fg` stroke.
  - **Clearspace**: Maintain at least `0.25×` mark width on all four sides. Never wrap the mark in a drop-shadowed pill or gradient badge.
- **Wordmark**:
  - Always lowercase **`odata-ui`** (never `OData-UI` in the logo lockup; prose may reference `ODataUI()` for the JS API).
  - Set in **`IBM Plex Sans`**, weight `700`, `14px` in the Operate top bar (`letter-spacing: -0.02em`), colored with `--odata-ui-text` (never gradient text).

---

## 2. Color Architecture & Token Specification

### Perceptual Hue Harmony (OKLCH Provenance)

Every color pair across Light and Dark modes is aligned in OKLCH space and emitted as clean sRGB hex / `rgba(...)` values for universal browser and Shadow DOM compatibility. Across modes, every chromatic family stays within **`ΔH ≤ 6.2°`**:

| Role               | Family Name            | Light Hex | Light OKLCH (`L / C / H°`) | Dark Hex  | Dark OKLCH (`L / C / H°`) | `ΔH`         |
| ------------------ | ---------------------- | --------- | -------------------------- | --------- | ------------------------- | ------------ |
| Neutral Canvas     | Warm Stone / Carbon    | `#F8F7F4` | `0.976 / 0.004 / 91.4°`    | `#121110` | `0.178 / 0.003 / 67.7°`   | Warm mineral |
| Neutral Ink        | Graphite / Parchment   | `#181714` | `0.205 / 0.006 / 91.6°`    | `#F2F0EB` | `0.955 / 0.007 / 88.6°`   | `3.0°`       |
| **Brand Accent**   | **Verdigris Teal**     | `#0A6661` | `0.461 / 0.077 / 188.8°`   | `#35CBBF` | `0.764 / 0.122 / 186.9°`  | `1.9°`       |
| **Key / Warning**  | **Warm Ochre**         | `#855105` | `0.484 / 0.105 / 67.3°`    | `#ECA846` | `0.779 / 0.137 / 72.9°`   | `5.6°`       |
| **Navigation**     | **Mineral Cerulean**   | `#155B82` | `0.449 / 0.092 / 239.0°`   | `#6BBCE6` | `0.760 / 0.100 / 232.8°`  | `6.2°`       |
| **Success**        | **Botanical Pine**     | `#14633A` | `0.443 / 0.100 / 155.1°`   | `#57CC8A` | `0.761 / 0.143 / 155.8°`  | `0.7°`       |
| **Danger / Error** | **Terracotta Crimson** | `#A82420` | `0.480 / 0.169 / 27.6°`    | `#F27D77` | `0.721 / 0.145 / 24.3°`   | `3.3°`       |
| **Advisor Tip**    | **Slate-Cobalt**       | `#3B4E8A` | `0.439 / 0.102 / 268.7°`   | `#9AAEEB` | `0.758 / 0.091 / 270.1°`  | `1.4°`       |

### Complete `--odata-ui-*` Token Table & Verified WCAG 2.1 Contrast Ratios

All ratios below are programmatically verified using the WCAG 2.1 relative-luminance formula. Translucent dark `rgba(...)` backgrounds are alpha-composited against their worst-case (lightest) underlying surface (`#201E1B` elevated) to guarantee compliance everywhere they render.

#### Surfaces, Borders & Ink

| Token                       | Light Value | Dark Value | Semantic Usage                                                                                                     | Verified Contrast (Light / Dark)                                                 |
| --------------------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `--odata-ui-bg`             | `#F8F7F4`   | `#121110`  | Primary workspace canvas, diagram stage, docs background                                                           | Base canvas                                                                      |
| `--odata-ui-bg-subtle`      | `#F1EFEA`   | `#181715`  | Recessed chrome: sidebar, topbar, tab strip, table headers, `<pre>` code/JSON blocks                               | Subtle surface separation                                                        |
| `--odata-ui-bg-elevated`    | `#FFFFFF`   | `#201E1B`  | Elevated containers: inputs, buttons, tables, advisor cards, diagram entity cards                                  | Elevated surface separation                                                      |
| `--odata-ui-bg-hover`       | `#E7E4DC`   | `#2A2723`  | Hover state for interactive rows/buttons, neutral badge fill, skeleton bars                                        | `text` on hover: **14.11:1 / 13.05:1**                                           |
| `--odata-ui-border`         | `#DFDCD2`   | `#322F2A`  | Quiet structural hairlines (panel seams, table row rules, section dividers)                                        | `1.28–1.37:1` / `1.25–1.42:1` (non-interactive)                                  |
| `--odata-ui-border-strong`  | `#8B877C`   | `#706C63`  | **Interactive control borders** (inputs, selects, buttons, chips, URL bar, diagram card outline)                   | vs elevated: **3.59:1 / 3.18:1**; vs subtle: **3.12:1 / 3.42:1** (`≥ 3.0:1`)     |
| `--odata-ui-canvas-dot`     | `#CFCBC0`   | `#3E3B34`  | Diagram stage drafting dot grid (`1px` radial dots on `--odata-ui-bg`)                                             | `1.51:1 / 1.69:1` (decorative texture)                                           |
| `--odata-ui-text`           | `#181714`   | `#F2F0EB`  | Primary body text, headings, input values, diagram card titles                                                     | vs `bg`: **16.73:1 / 16.56:1**; vs `elevated`: **17.93:1 / 14.60:1** (`AAA`)     |
| `--odata-ui-text-secondary` | `#4A4740`   | `#BEB9AE`  | Secondary prose, sidebar items, diagram properties & edge labels, neutral badge text                               | vs `bg`: **8.65:1 / 9.65:1**; vs `hover`: **7.29:1 / 7.60:1** (`AAA`)            |
| `--odata-ui-text-muted`     | `#615D54`   | `#9A9589`  | Placeholders, uppercase section/table headers, inactive tabs, null markers (`—`), diagram types, inheritance edges | vs `elevated`: **6.56:1 / 5.57:1**; vs `subtle`: **5.71:1 / 6.00:1** (`≥ 4.5:1`) |

#### Brand Accent (Verdigris)

| Token                      | Light Value | Dark Value                 | Semantic Usage                                                                                                   | Verified Contrast (Light / Dark)                                                                           |
| -------------------------- | ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--odata-ui-accent`        | `#0A6661`   | `#35CBBF`                  | Primary CTA fill, active tab bar & label, links, active tree/chip text, focus ring, selected diagram border      | Text vs `bg`: **6.35:1 / 9.38:1**; vs `subtle`: **5.92:1 / 8.91:1**; vs `accent-soft`: **5.92:1 / 6.35:1** |
| `--odata-ui-accent-hover`  | `#07504C`   | `#58DDD2`                  | Primary CTA hover fill                                                                                           | `accent-fg` on hover: **9.29:1 / 10.75:1**                                                                 |
| `--odata-ui-accent-fg`     | `#FFFFFF`   | `#071B19`                  | Foreground label/icon on `--odata-ui-accent` buttons & active segmented controls                                 | vs `accent`: **6.80:1 / 8.85:1**                                                                           |
| `--odata-ui-accent-soft`   | `#E4F2F0`   | `rgba(53, 203, 191, 0.14)` | Active sidebar item, active `$select` chip, info banner, selected diagram card header, `::selection`, focus halo | `accent` on soft: **5.92:1 / 6.35:1**; `text` on soft: **15.59:1 / 11.21:1**                               |
| `--odata-ui-accent-border` | `#489C96`   | `rgba(53, 203, 191, 0.56)` | Borders on accent-tinted banners and active accents                                                              | vs `elevated`: **3.25:1 / 3.49:1** (`≥ 3.0:1`)                                                             |

#### Semantic Status & OData Domain Tokens

| Token                       | Light Value | Dark Value                  | Semantic Usage                                                                                                 | Verified Contrast (Light / Dark)                                        |
| --------------------------- | ----------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `--odata-ui-key`            | `#855105`   | `#ECA846`                   | Primary key (`KEY` / `PK`) badges and diagram PK rows                                                          | vs `key-bg`: **5.89:1 / 6.18:1**; vs `elevated`: **6.61:1 / 8.12:1**    |
| `--odata-ui-key-bg`         | `#FBF1DC`   | `rgba(236, 168, 70, 0.14)`  | Key badge background                                                                                           | Paired with `--odata-ui-key`                                            |
| `--odata-ui-key-border`     | `#B57E2B`   | `rgba(236, 168, 70, 0.55)`  | Key/warning outline when bordered                                                                              | vs `elevated`: **3.51:1 / 3.40:1** (`≥ 3.0:1`)                          |
| `--odata-ui-nav`            | `#155B82`   | `#6BBCE6`                   | Navigation cardinality badges, `.oui-nav-chip` text, diagram navigation edge stroke & arrowhead                | vs `nav-bg`: **6.37:1 / 6.06:1**; edge vs `bg`: **6.88:1 / 8.95:1**     |
| `--odata-ui-nav-bg`         | `#E6F0F7`   | `rgba(107, 188, 230, 0.14)` | Navigation badge & `.oui-nav-chip` fill                                                                        | Paired with `--odata-ui-nav`                                            |
| `--odata-ui-nav-border`     | `#558DAD`   | `rgba(107, 188, 230, 0.56)` | `.oui-nav-chip` border (replaces mismatched teal border)                                                       | vs `elevated`: **3.62:1 / 3.38:1** (`≥ 3.0:1`)                          |
| `--odata-ui-success`        | `#14633A`   | `#57CC8A`                   | HTTP `2xx` status badges, positive execution feedback                                                          | vs `success-bg`: **6.38:1 / 6.30:1**                                    |
| `--odata-ui-success-bg`     | `#E5F3EB`   | `rgba(87, 204, 138, 0.14)`  | Success badge background                                                                                       | Paired with `--odata-ui-success`                                        |
| `--odata-ui-success-border` | `#4E9670`   | `rgba(87, 204, 138, 0.56)`  | Success banner/chip border                                                                                     | vs `elevated`: **3.55:1 / 3.48:1** (`≥ 3.0:1`)                          |
| `--odata-ui-warning`        | `#855105`   | `#ECA846`                   | Advisor `WARNING`, warning banners, `ACTION`/`POST` mutation badge, `ContainsTarget` & contained diagram edges | vs `warning-bg`: **5.89:1 / 6.18:1**; edge vs `bg`: **6.17:1 / 9.21:1** |
| `--odata-ui-warning-bg`     | `#FBF1DC`   | `rgba(236, 168, 70, 0.14)`  | Warning badge & banner background                                                                              | Paired with `--odata-ui-warning`                                        |
| `--odata-ui-warning-border` | `#B57E2B`   | `rgba(236, 168, 70, 0.55)`  | Warning banner border                                                                                          | vs `elevated`: **3.51:1 / 3.40:1** (`≥ 3.0:1`)                          |
| `--odata-ui-danger`         | `#A82420`   | `#F27D77`                   | Advisor `ERROR`, HTTP `4xx`/`5xx`, error banners, destructive button text & hover fill                         | vs `danger-bg`: **6.15:1 / 4.95:1** (`5.77:1` on `bg`)                  |
| `--odata-ui-danger-hover`   | `#8B1B18`   | `#F79994`                   | Destructive solid button hover state                                                                           | `danger-fg` on hover: **9.26:1 / 9.07:1**                               |
| `--odata-ui-danger-fg`      | `#FFFFFF`   | `#1F0807`                   | Foreground label on solid `--odata-ui-danger` (fixes Dark mode white-on-coral contrast failure)                | vs `danger`: **7.15:1 / 7.28:1**                                        |
| `--odata-ui-danger-bg`      | `#FCEAE8`   | `rgba(242, 125, 119, 0.15)` | Error banner, danger badge, danger button default fill                                                         | Paired with `--odata-ui-danger`                                         |
| `--odata-ui-danger-border`  | `#C65B56`   | `rgba(242, 125, 119, 0.62)` | Error banner & danger button border                                                                            | vs `elevated`: **4.17:1 / 3.24:1** (`≥ 3.0:1`)                          |
| `--odata-ui-tip`            | `#3B4E8A`   | `#9AAEEB`                   | Advisor `TIP` severity badge only                                                                              | vs `tip-bg`: **6.92:1 / 5.70:1** (`6.67:1` on `bg`)                     |
| `--odata-ui-tip-bg`         | `#ECEFF9`   | `rgba(154, 174, 235, 0.15)` | Advisor `TIP` badge background                                                                                 | Paired with `--odata-ui-tip`                                            |
| `--odata-ui-tip-border`     | `#7283B8`   | `rgba(154, 174, 235, 0.58)` | Advisory notice border                                                                                         | vs `elevated`: **3.71:1 / 3.49:1** (`≥ 3.0:1`)                          |

#### JSON Syntax Tokens (Rendered on `--odata-ui-bg-subtle`)

| Token                  | Light Value | Dark Value | Syntax Element                       | Verified Contrast on `bg-subtle` (Light / Dark) |
| ---------------------- | ----------- | ---------- | ------------------------------------ | ----------------------------------------------- |
| `--odata-ui-json-key`  | `#0A6661`   | `#35CBBF`  | Object property keys (`"UserName":`) | **5.92:1 / 8.91:1**                             |
| `--odata-ui-json-str`  | `#14633A`   | `#57CC8A`  | String literals (`"russellwhyte"`)   | **6.36:1 / 8.88:1**                             |
| `--odata-ui-json-num`  | `#855105`   | `#ECA846`  | Numeric literals (`42`, `3.14`)      | **5.75:1 / 8.75:1**                             |
| `--odata-ui-json-bool` | `#155B82`   | `#6BBCE6`  | Booleans (`true`, `false`)           | **6.41:1 / 8.50:1**                             |
| `--odata-ui-json-null` | `#615D54`   | `#9A9589`  | `null` literals & punctuation mute   | **5.71:1 / 6.00:1**                             |

#### Geometry, Elevation & Scrim Tokens

| Token                  | Light Value                                                           | Dark Value                                                      | Usage                                                                                    |
| ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `--odata-ui-radius-sm` | `4px`                                                                 | `4px`                                                           | Inputs, buttons, badges, chips, code pills, segmented controls                           |
| `--odata-ui-radius`    | `6px`                                                                 | `6px`                                                           | Tables, banners, URL bar, advisor cards, filter groups, `<pre>` blocks                   |
| `--odata-ui-radius-lg` | `0px`                                                                 | `0px`                                                           | Outer `.oui-root` shell (edge-to-edge embedding; hosts may override to `8px` when inset) |
| `--odata-ui-shadow`    | `0 4px 14px rgba(24, 23, 20, 0.09), 0 1px 3px rgba(24, 23, 20, 0.06)` | `0 8px 24px rgba(0, 0, 0, 0.52), 0 1px 3px rgba(0, 0, 0, 0.36)` | Floating overlays only (mobile drawer, popovers); never used on inline cards             |
| `--odata-ui-scrim`     | `rgba(24, 23, 20, 0.34)`                                              | `rgba(0, 0, 0, 0.56)`                                           | Mobile sidebar drawer backdrop                                                           |

### Canonical CSS Token Blocks (`packages/core/src/styles/odata-ui.css`)

```css
:host {
  color-scheme: light;

  --odata-ui-font-sans:
    'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --odata-ui-font-mono:
    'IBM Plex Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  /* Light Theme — Drafting Vellum (Warm Mineral Neutrals, OKLCH H ≈ 87–91°) */
  --odata-ui-bg: #f8f7f4;
  --odata-ui-bg-subtle: #f1efea;
  --odata-ui-bg-elevated: #ffffff;
  --odata-ui-bg-hover: #e7e4dc;
  --odata-ui-border: #dfdcd2;
  --odata-ui-border-strong: #8b877c;
  --odata-ui-canvas-dot: #cfcbc0;
  --odata-ui-text: #181714;
  --odata-ui-text-secondary: #4a4740;
  --odata-ui-text-muted: #615d54;

  /* Brand Accent — Verdigris Teal (OKLCH H ≈ 189°) */
  --odata-ui-accent: #0a6661;
  --odata-ui-accent-hover: #07504c;
  --odata-ui-accent-fg: #ffffff;
  --odata-ui-accent-soft: #e4f2f0;
  --odata-ui-accent-border: #489c96;

  /* Semantic & OData Domain Tokens (All pairs verified ≥ 4.5:1 text / ≥ 3.0:1 border) */
  --odata-ui-key: #855105;
  --odata-ui-key-bg: #fbf1dc;
  --odata-ui-key-border: #b57e2b;
  --odata-ui-nav: #155b82;
  --odata-ui-nav-bg: #e6f0f7;
  --odata-ui-nav-border: #558dad;
  --odata-ui-success: #14633a;
  --odata-ui-success-bg: #e5f3eb;
  --odata-ui-success-border: #4e9670;
  --odata-ui-warning: #855105;
  --odata-ui-warning-bg: #fbf1dc;
  --odata-ui-warning-border: #b57e2b;
  --odata-ui-danger: #a82420;
  --odata-ui-danger-hover: #8b1b18;
  --odata-ui-danger-fg: #ffffff;
  --odata-ui-danger-bg: #fceae8;
  --odata-ui-danger-border: #c65b56;
  --odata-ui-tip: #3b4e8a;
  --odata-ui-tip-bg: #eceff9;
  --odata-ui-tip-border: #7283b8;

  /* JSON Syntax Palette (on --odata-ui-bg-subtle) */
  --odata-ui-json-key: #0a6661;
  --odata-ui-json-str: #14633a;
  --odata-ui-json-num: #855105;
  --odata-ui-json-bool: #155b82;
  --odata-ui-json-null: #615d54;

  /* Geometry & Overlays */
  --odata-ui-radius-sm: 4px;
  --odata-ui-radius: 6px;
  --odata-ui-radius-lg: 0px;
  --odata-ui-shadow: 0 4px 14px rgba(24, 23, 20, 0.09), 0 1px 3px rgba(24, 23, 20, 0.06);
  --odata-ui-scrim: rgba(24, 23, 20, 0.34);
}

:host([data-theme='dark']),
.oui-root[data-theme='dark'] {
  color-scheme: dark;

  /* Dark Theme — Warm Obsidian Carbon (Same Warm Mineral Hue Family, Zero Blue-Slate Cast) */
  --odata-ui-bg: #121110;
  --odata-ui-bg-subtle: #181715;
  --odata-ui-bg-elevated: #201e1b;
  --odata-ui-bg-hover: #2a2723;
  --odata-ui-border: #322f2a;
  --odata-ui-border-strong: #706c63;
  --odata-ui-canvas-dot: #3e3b34;
  --odata-ui-text: #f2f0eb;
  --odata-ui-text-secondary: #beb9ae;
  --odata-ui-text-muted: #9a9589;

  /* Brand Accent — Verdigris Teal (OKLCH H ≈ 187°) */
  --odata-ui-accent: #35cbbf;
  --odata-ui-accent-hover: #58ddd2;
  --odata-ui-accent-fg: #071b19;
  --odata-ui-accent-soft: rgba(53, 203, 191, 0.14);
  --odata-ui-accent-border: rgba(53, 203, 191, 0.56);

  /* Semantic & OData Domain Tokens */
  --odata-ui-key: #eca846;
  --odata-ui-key-bg: rgba(236, 168, 70, 0.14);
  --odata-ui-key-border: rgba(236, 168, 70, 0.55);
  --odata-ui-nav: #6bbce6;
  --odata-ui-nav-bg: rgba(107, 188, 230, 0.14);
  --odata-ui-nav-border: rgba(107, 188, 230, 0.56);
  --odata-ui-success: #57cc8a;
  --odata-ui-success-bg: rgba(87, 204, 138, 0.14);
  --odata-ui-success-border: rgba(87, 204, 138, 0.56);
  --odata-ui-warning: #eca846;
  --odata-ui-warning-bg: rgba(236, 168, 70, 0.14);
  --odata-ui-warning-border: rgba(236, 168, 70, 0.55);
  --odata-ui-danger: #f27d77;
  --odata-ui-danger-hover: #f79994;
  --odata-ui-danger-fg: #1f0807;
  --odata-ui-danger-bg: rgba(242, 125, 119, 0.15);
  --odata-ui-danger-border: rgba(242, 125, 119, 0.62);
  --odata-ui-tip: #9aaeeb;
  --odata-ui-tip-bg: rgba(154, 174, 235, 0.15);
  --odata-ui-tip-border: rgba(154, 174, 235, 0.58);

  /* JSON Syntax Palette (on --odata-ui-bg-subtle) */
  --odata-ui-json-key: #35cbbf;
  --odata-ui-json-str: #57cc8a;
  --odata-ui-json-num: #eca846;
  --odata-ui-json-bool: #6bbce6;
  --odata-ui-json-null: #9a9589;

  --odata-ui-shadow: 0 8px 24px rgba(0, 0, 0, 0.52), 0 1px 3px rgba(0, 0, 0, 0.36);
  --odata-ui-scrim: rgba(0, 0, 0, 0.56);
}
```

---

## 3. Badge & Color Restraint Rules (Anti-"Skittles" Policy)

**Core Rule: Neutral by default; color only when it signals identity-critical OData structure, mutation risk, live execution status, or diagnostic severity.** Never place more than **two** chromatic badge hues inside the same header or table row.

### Badge Allocation Matrix

| UI Context / Badge Content                                                                                                                     | Required Class                                                                        | Rationale                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Schema kind labels (`EntitySet`, `Singleton`, `EntityType`, `ComplexType`, `EnumType`, `Bound`, `Unbound`)                                     | `.oui-badge` **(Neutral)**                                                            | Structural taxonomy is read from the sidebar/header context; coloring every kind turns entity headers into a rainbow. |
| Type facets & modifiers (`Abstract`, `OpenType`, `Media Stream`, `Flags`, `Composable`, `Nullable`, `MaxLength`, `from BaseType`, `Edm.Int32`) | `.oui-badge` **(Neutral)**                                                            | Informational metadata facets belong in quiet neutral pills.                                                          |
| Topbar OData version (`v4`, `v3`), sidebar group counts, advisor category tags                                                                 | `.oui-badge` **(Neutral)**                                                            | Must not compete visually with the primary `Load` button or active tree selection.                                    |
| Sidebar operation sublabels (`FN`)                                                                                                             | `.oui-badge` **(Neutral)**                                                            | Read-only functions stay calm in the tree; only mutating `ACT` stands out.                                            |
| Primary keys (`KEY`, `Key: UserName`)                                                                                                          | `.oui-badge-key` **(Ochre)**                                                          | Primary keys are the primary identity anchor in OData URLs and diagrams.                                              |
| Navigation cardinality (`1`, `0..1`, `*`) & drill-down `.oui-nav-chip`                                                                         | `.oui-badge-nav` **(Cerulean)**                                                       | Matches the solid Cerulean navigation edge in the relationship diagram.                                               |
| Containment (`ContainsTarget`)                                                                                                                 | `.oui-badge-warning` **(Ochre)**                                                      | Matches the dashed Ochre containment edge in the relationship diagram.                                                |
| Mutating actions (`ACT`, `Action`, `POST` in Query Builder)                                                                                    | `.oui-badge-warning` **(Ochre)** (or `.oui-badge-danger` only on destructive confirm) | Clearly differentiates side-effecting POST operations from idempotent GET queries.                                    |
| Active read query verb (`GET` in Query Builder URL bar)                                                                                        | `.oui-badge-accent` **(Verdigris)**                                                   | Single primary-verb anchor directly left of the executable URL.                                                       |
| HTTP execution result status (`200 OK` vs `4xx`/`5xx`)                                                                                         | `.oui-badge-success` / `.oui-badge-danger`                                            | Live network outcome earns immediate semantic color.                                                                  |
| Advisor diagnostics (`ERROR` / `WARNING` / `TIP`)                                                                                              | `.oui-badge-danger` / `.oui-badge-warning` / `.oui-badge-tip`                         | The Advisor is the **only** surface where `.oui-badge-tip` (Slate-Cobalt) is used.                                    |
| Results grid booleans (`true` / `false`)                                                                                                       | Plain `.oui-code` or `.oui-badge` **(Neutral)**                                       | Do **not** paint every `true` cell green—boolean values are data, not success statuses.                               |

### Visual Craft Bans

- **No left-edge color bars** on cards or banners (`border-left: 3px solid …` on rounded boxes). Use full `1px` semantic borders + soft fill + leading icon/badge.
- **No nested cards**: Query Builder sections and Details sections sit directly on `--odata-ui-bg` separated by `1px` `--odata-ui-border` hairlines (not boxed inside extra bordered cards).
- **No mismatched border/fill pairs**: Every tinted chip/banner must pair its own border token (e.g., `.oui-nav-chip` uses `--odata-ui-nav-border`, never `--odata-ui-accent-border`; `.oui-banner-error` uses `--odata-ui-danger-border`, `.oui-banner-warning` uses `--odata-ui-warning-border`).
- **No hardcoded `#ffffff` on semantic hover**: `.oui-btn-danger:hover` must use `color: var(--odata-ui-danger-fg)` so Dark mode stays at **7.28:1** instead of failing with white-on-coral.
- **No emoji or Unicode glyphs as UI icons**: All icons come from `packages/core/src/ui/icons.ts` (`stroke-width: 1.75–2`, `currentColor`).

---

## 4. Typography, Spacing & Density

### Font Families

- **Primary UI & Editorial Sans**: `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` — One crisp technical neo-grotesque carries headings, navigation, tabs, buttons, tables, and documentation prose.
- **Technical Monospace**: `'IBM Plex Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace` — Used **strictly** for actual code, URLs, EDM types, query expressions, JSON payloads, and tabular numeric columns (never as decorative headings or labels).

### Type Scale (Fixed `px` Steps — No Fluid `clamp()` in Operate Mode)

| Role                                  | Size     | Weight        | Line Height | Tracking                       | Notes                                                 |
| ------------------------------------- | -------- | ------------- | ----------- | ------------------------------ | ----------------------------------------------------- |
| Docs Page Title (`h1`, Read mode)     | `28px`   | `700`         | `1.20`      | `-0.025em`                     | `apps/demo` Docs & Metadata Guide                     |
| Detail / Docs Section Heading (`h2`)  | `18px`   | `600`         | `1.25`      | `-0.015em`                     | `.oui-detail-title`, `.docs-section h2`               |
| Host Brand Wordmark / Docs `h3`       | `14px`   | `700` / `600` | `1.35`      | `-0.02em` / `0`                | `.site-brand`, `.docs-section h3`                     |
| Docs Body Prose (Read mode)           | `14px`   | `400`         | `1.60`      | `0`                            | Constrained to `65–75ch` (`max-width: 68ch`)          |
| Explorer Body & Tables (Operate mode) | `13px`   | `400`         | `1.48`      | `0`                            | Root `:host` baseline                                 |
| Interactive Controls & Tree Rows      | `12.5px` | `400` / `500` | `1.40`      | `0`                            | Inputs, selects, buttons, tabs, tree items            |
| Code, URLs, JSON & Grid Numbers       | `12px`   | `400` / `500` | `1.52`      | `0`                            | `IBM Plex Mono`, `font-variant-numeric: tabular-nums` |
| Badges, Table `th`, Group Labels      | `11px`   | `600`         | `1.30`      | `0.04em` (caps) / `0` (badges) | Uppercase headers use `--odata-ui-text-muted`         |
| Diagram Edge & Type Labels            | `10.5px` | `400`         | `1.20`      | `0`                            | `IBM Plex Mono` inside SVG                            |

### Spacing, Density & Browser Surface Polish

- **Base Grid**: `4px` spatial unit. Compact interactive controls (`30px` min-height, `25px` for `.oui-btn-sm`), `8px` toolbar padding, `18px 20px` desktop content padding (`14px 12px` mobile).
- **Layout Proportions**:
  - Demo host header: `46px` min-height, single row on desktop.
  - Explorer sidebar: `260px` fixed width on desktop; off-canvas drawer (`min(290px, 85vw)`) below `820px`.
  - Read-mode docs container: `max-width: 74ch` centered, `36px 20px 72px` padding.
- **Browser Surfaces**:
  - `::selection`: `background: var(--odata-ui-accent-soft); color: var(--odata-ui-text);`
  - `caret-color: var(--odata-ui-accent);`
  - Focus rings: `:focus-visible` uses `2px solid var(--odata-ui-accent)` (`outline-offset: 1px` on buttons/selects; `border-color: var(--odata-ui-accent)` + `0 0 0 2px var(--odata-ui-accent-soft)` on inputs).
  - Links: `text-underline-offset: 3px`.
  - Scrollbars: `8px` thin trackless thumb in `--odata-ui-border-strong` (with `scrollbar-color` set for Firefox).
  - Motion: `120–180ms ease` for state/color/drawer transitions only. No decorative entrance choreography.

---

## 5. Surface Elevation & Hairline Grammar

Operate mode communicates hierarchy through **4 subtle tonal steps + `1px` hairlines** rather than heavy shadows:

1. **Layer 0 — Recessed Chrome (`--odata-ui-bg-subtle`)**: Sidebar tree, top command bar, tab bar, table header rows, `<pre>` code/JSON panels, nested filter/expand wells.
2. **Layer 1 — Primary Canvas (`--odata-ui-bg`)**: Main detail/query/advisor scroll view, diagram stage, docs reading background.
3. **Layer 2 — Elevated Work Surface (`--odata-ui-bg-elevated`)**: Data tables, form inputs, default buttons, advisor cards, diagram entity cards, host header bar.
4. **Layer 3 — Hover / Interactive Lift (`--odata-ui-bg-hover`)**: Hovered rows, hovered buttons, neutral badges, loading skeleton bars.

**Border Separation Rule**:

- Use `--odata-ui-border` (`1px`) for **structural containment** (sidebar seam, header bottom rule, table rows, card/table frames, section dividers).
- Use `--odata-ui-border-strong` (`1px`, guaranteed `≥ 3.0:1`) for **interactive boundaries** (inputs, selects, buttons, chips, segmented controls, editable URL bar, draggable diagram cards).

---

## 6. Relationship Diagram Color & Stroke Grammar

The interactive SVG diagram (`packages/core/src/ui/diagram-view.ts`) uses an architectural schematic vocabulary:

| Element                                 | Fill / Stroke                                                                   | Weight / Dash                        | Notes                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| **Stage Background**                    | `--odata-ui-bg` + `radial-gradient(--odata-ui-canvas-dot 1px, transparent 1px)` | `22px × 22px` grid                   | Subtle drafting paper dots; never competes with edges                 |
| **Entity / Complex Card Body**          | Fill: `--odata-ui-bg-elevated`; Stroke: `--odata-ui-border-strong`              | `1.25px`, `rx: 6`                    | `≥ 3.18:1` card outline on both themes                                |
| **Selected Card**                       | Head Fill: `--odata-ui-accent-soft`; Stroke: `--odata-ui-accent`                | `2px`                                | Title remains `--odata-ui-text` (`15.59:1` / `11.21:1`)               |
| **Card Header**                         | Fill: `--odata-ui-bg-subtle`; Bottom Divider: `--odata-ui-border`               | `30px` height                        | Title `12.5px` bold `--odata-ui-text`                                 |
| **Primary Key Row (`PK`)**              | Text: `--odata-ui-key` (`600`)                                                  | `11.5px`                             | `6.61:1` light / `8.12:1` dark on `--odata-ui-bg-elevated`            |
| **Regular Property / Type**             | Name: `--odata-ui-text-secondary`; Type: `--odata-ui-text-muted` (`mono`)       | `11.5px` / `10.5px`                  | Right-aligned EDM types                                               |
| **Navigation Edge**                     | Stroke & Filled Arrow: `--odata-ui-nav` (Mineral Cerulean)                      | `1.5px` solid                        | `6.88:1` light / `8.95:1` dark against `--odata-ui-bg`                |
| **Containment Edge (`ContainsTarget`)** | Stroke & Filled Arrow: `--odata-ui-warning` (Warm Ochre)                        | `1.5px`, `dasharray: 5 3`            | Visually distinct from navigation even in monochrome via dash pattern |
| **Inheritance Edge (`BaseType`)**       | Stroke: `--odata-ui-text-muted`; Hollow Triangle Fill: `--odata-ui-bg`          | `1.3px`, `dasharray: 4 3`            | Standard UML open-head generalization arrow (`6.12:1` / `6.32:1`)     |
| **Edge Label**                          | Fill: `--odata-ui-text-secondary`; Halo Stroke: `--odata-ui-bg` (`4px`)         | `10.5px` mono, `paint-order: stroke` | Halo cuts cleanly through crossing edges (`8.65:1` / `9.65:1`)        |

---

## 7. JSON Syntax Token Palette

Raw response JSON (`.oui-pre.oui-json-view` rendered on `--odata-ui-bg-subtle`) uses dedicated `--odata-ui-json-*` tokens so syntax highlighting stays tuned to the surface without borrowing unrelated semantic tokens:

```css
.oui-json-key {
  color: var(--odata-ui-json-key);
} /* Verdigris Teal   — 5.92:1 L / 8.91:1 D */
.oui-json-str {
  color: var(--odata-ui-json-str);
} /* Botanical Pine   — 6.36:1 L / 8.88:1 D */
.oui-json-num {
  color: var(--odata-ui-json-num);
} /* Warm Ochre       — 5.75:1 L / 8.75:1 D */
.oui-json-bool {
  color: var(--odata-ui-json-bool);
} /* Mineral Cerulean — 6.41:1 L / 8.50:1 D */
.oui-json-null {
  color: var(--odata-ui-json-null);
} /* Muted Stone      — 5.71:1 L / 6.00:1 D */
```

---

## 8. Host-App Theme Synchronization Contract (`apps/demo` ↔ `@odata-ui/core`)

Currently, toggling Light/Dark inside `@odata-ui/core` updates `data-theme` on `#explorer`, while `apps/demo/src/style.css` only listens to `@media (prefers-color-scheme: dark)`—creating a split light/dark header whenever the user overrides the OS preference. The following contract eliminates that drift permanently:

### 1. `@odata-ui/core` Responsibilities (`packages/core/src/mount.ts`)

1. **Attribute Reflection**: On initial mount and every theme state transition, set `data-theme="light" | "dark"` on both `.oui-root` (inside Shadow DOM) and the mount host `element`.
2. **Composed Event Emission**: Whenever `resolvedTheme` changes, dispatch a bubbling, shadow-piercing `CustomEvent` from `element`:
   ```ts
   element.dispatchEvent(
     new CustomEvent('odata-ui:theme-change', {
       detail: { theme: state.theme, resolvedTheme: state.resolvedTheme },
       bubbles: true,
       composed: true,
     }),
   );
   ```
3. **Optional Callback Option**: Support `onThemeChange?: (resolvedTheme: 'light' | 'dark', theme: ThemeMode) => void` in `ODataUIMountOptions` for imperative hosts (React/Vue/ASP.NET Core).

### 2. Host App (`apps/demo`) Responsibilities

1. **CSS Selector Precedence (`apps/demo/src/style.css`)**:
   - Define Light tokens (matching `--odata-ui-*` exactly) + `color-scheme: light;` on `:root`.
   - Define Dark tokens + `color-scheme: dark;` under **both**:
     - `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ... } }` (initial OS auto-match before JS runs, zero flash of wrong theme), AND
     - `:root[data-theme='dark'] { ... }` (explicit dark override even on a Light OS).
   - Mirror the exact canonical hex/rgba values from Section 2 so `.site-header`, `.preset-select`, `.nav-link`, and `.view-docs` are pixel-indistinguishable in tone from `@odata-ui/core`.
2. **Event Wiring (`apps/demo/src/main.ts`)**:
   - Listen for `odata-ui:theme-change` on `#explorer` (or pass `onThemeChange`) and apply:
     ```ts
     document.documentElement.setAttribute('data-theme', resolvedTheme);
     ```
   - On initial load, sync `document.documentElement` immediately to the explorer's resolved theme so Docs, Metadata Guide, native `<select>` dropdowns, and scrollbars stay 100% unified with the explorer.
