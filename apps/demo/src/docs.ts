export interface DocsCallbacks {
  onOpenPreset: (url: string) => void;
}

export function renderDocsPage(
  section: 'docs' | 'metadata-guide',
  callbacks: DocsCallbacks,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'docs-container';

  if (section === 'metadata-guide') {
    root.innerHTML = `
      <div class="docs-hero">
        <h1>Building Better OData <code>$metadata</code></h1>
        <p>
          OData services shine when their CSDL <code>$metadata</code> document is complete, self-describing,
          and honest about query capabilities. <strong>odata-ui</strong> includes a built-in
          <strong>Metadata Advisor</strong> that inspects any live or uploaded <code>$metadata</code> file and
          highlights high-leverage improvements for API builders.
        </p>
      </div>

      <div class="docs-card">
        <h2>1. Declare <code>Org.OData.Capabilities.V1</code> on Every EntitySet</h2>
        <p>
          Clients and explorers cannot tell from an <code>EntitySet</code> alone whether <code>$filter</code>,
          <code>$search</code>, <code>$expand</code>, or <code>POST/PATCH/DELETE</code> are enabled. Adding
          OASIS Capabilities annotations prevents runtime <code>400</code>/<code>501</code> surprises and
          improves generated OpenAPI/Swagger documentation.
        </p>
        <pre>&lt;EntitySet Name="People" EntityType="Trippin.Person"&gt;
  &lt;Annotation Term="Org.OData.Capabilities.V1.FilterRestrictions"&gt;
    &lt;Record&gt;
      &lt;PropertyValue Property="Filterable" Bool="true" /&gt;
    &lt;/Record&gt;
  &lt;/Annotation&gt;
  &lt;Annotation Term="Org.OData.Capabilities.V1.SearchRestrictions"&gt;
    &lt;Record&gt;
      &lt;PropertyValue Property="Searchable" Bool="true" /&gt;
    &lt;/Record&gt;
  &lt;/Annotation&gt;
&lt;/EntitySet&gt;</pre>
        <button type="button" class="docs-cta" data-preset="https://services.odata.org/V4/TripPinServiceRW">
          Compare Capabilities live in TripPin V4 RW →
        </button>
      </div>

      <div class="docs-card">
        <h2>2. Bind Non-Contained Navigation Properties (<code>NavigationPropertyBinding</code>)</h2>
        <p>
          In OData v4, every non-contained <code>NavigationProperty</code> on an entity type exposed through
          an <code>EntitySet</code> should have a matching <code>&lt;NavigationPropertyBinding&gt;</code>.
          Without it, clients cannot reliably resolve canonical URLs or know which EntitySet backs an
          expanded relationship. If child entities only exist inside a parent, set <code>ContainsTarget="true"</code>.
        </p>
        <pre>&lt;EntitySet Name="People" EntityType="Trippin.Person"&gt;
  &lt;NavigationPropertyBinding Path="Friends" Target="People" /&gt;
  &lt;NavigationPropertyBinding Path="BestFriend" Target="People" /&gt;
&lt;/EntitySet&gt;</pre>
      </div>

      <div class="docs-card">
        <h2>3. Add <code>Org.OData.Core.V1.Description</code> &amp; Document Action Side Effects</h2>
        <p>
          Adding <code>Core.Description</code> annotations to EntitySets, EntityTypes, Properties, and
          especially <code>POST</code> Actions turns <code>$metadata</code> into living documentation for
          explorers, SDK generators, and AI coding assistants.
        </p>
        <pre>&lt;Action Name="ResetDataSource"&gt;
  &lt;Annotation Term="Org.OData.Core.V1.Description"
              String="Resets the session sample database back to its initial seed data." /&gt;
&lt;/Action&gt;</pre>
      </div>

      <div class="docs-card">
        <h2>4. Pair Bidirectional Relationships with <code>Partner</code> &amp; Precise Facets</h2>
        <ul>
          <li><strong><code>Partner="..."</code></strong> links inverse navigation properties so ER diagrams and ORMs understand 1:N / M:N pairs.</li>
          <li><strong>Non-nullable keys</strong>: CSDL defaults <code>Nullable</code> to <code>true</code>. Always declare <code>Nullable="false"</code> on key properties (and consider <code>Core.Computed</code> / <code>Core.Immutable</code>).</li>
          <li><strong>Decimal facets</strong>: Specify <code>Precision</code> and <code>Scale</code> on <code>Edm.Decimal</code> properties to prevent rounding ambiguity in BI and financial clients.</li>
          <li><strong>Optimistic Concurrency</strong>: Declare <code>Org.OData.Core.V1.OptimisticConcurrency</code> on EntitySets that enforce ETags.</li>
        </ul>
      </div>

      <div class="docs-card">
        <h2>5. ASP.NET Core OData Quick Tip</h2>
        <p>
          When using <code>ODataConventionModelBuilder</code> in ASP.NET Core OData, you can attach vocabulary
          annotations (like <code>Core.Description</code> and <code>Capabilities.V1</code>) to the built
          <code>IEdmModel</code> before registering it with <code>AddRouteComponents</code>, or via
          <code>Microsoft.OData.ModelBuilder.CapabilitiesVocabularyConstants</code>.
        </p>
      </div>
    `;
  } else {
    root.innerHTML = `
      <div class="docs-hero">
        <h1><code>odata-ui</code> Documentation</h1>
        <p>
          Drop-in, framework-agnostic OData explorer: browse <code>$metadata</code>, visualize entity
          relationships, build typed OData queries visually, execute against live services, and audit
          metadata quality.
        </p>
      </div>

      <div class="docs-card">
        <h2>Drop-in Standalone Script (swagger-ui style)</h2>
        <p>
          The standalone IIFE bundle inlines its Shadow DOM stylesheet and assigns
          <code>globalThis.ODataUI</code> directly as a function — one script tag is the entire integration.
        </p>
        <pre>&lt;div id="explorer" style="height: 85vh"&gt;&lt;/div&gt;
&lt;script src="odata-ui.standalone.js"&gt;&lt;/script&gt;
&lt;script&gt;
  ODataUI({
    url: 'https://services.odata.org/TripPinRESTierService',
    dom_id: 'explorer',
    theme: 'auto', // 'light' | 'dark' | 'auto'
  });
&lt;/script&gt;</pre>
      </div>

      <div class="docs-card">
        <h2>ESM, React, and Vue Wrappers</h2>
        <h3>Plain TypeScript / ESM</h3>
        <pre>import { mount } from '@odata-ui/core';

const instance = mount(document.getElementById('explorer')!, {
  url: 'https://services.odata.org/TripPinRESTierService',
  headers: () =&gt; ({ Authorization: \`Bearer \${getToken()}\` }),
});

// Later:
instance.unmount();</pre>

        <h3>React (<code>@odata-ui/react</code>)</h3>
        <pre>import { ODataUI } from '@odata-ui/react';

export function ApiExplorer() {
  return &lt;ODataUI url="https://services.odata.org/TripPinRESTierService" theme="auto" /&gt;;
}</pre>

        <h3>Vue 3 (<code>@odata-ui/vue</code>)</h3>
        <pre>&lt;script setup lang="ts"&gt;
import { ODataUI } from '@odata-ui/vue';
&lt;/script&gt;

&lt;template&gt;
  &lt;ODataUI url="https://services.odata.org/TripPinRESTierService" /&gt;
&lt;/template&gt;</pre>
      </div>

      <div class="docs-card">
        <h2>Options &amp; Instance API</h2>
        <table class="docs-table">
          <thead>
            <tr><th>Option</th><th>Type</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>url</code></td><td><code>string</code></td><td>Service root or <code>/$metadata</code> URL. Redirects (e.g. TripPin session prefixes) are automatically adopted.</td></tr>
            <tr><td><code>metadata</code></td><td><code>string</code></td><td>Raw XML (v2/v3/v4) or JSON CSDL (v4/v4.01) string for offline browsing.</td></tr>
            <tr><td><code>dom_id</code> / <code>domNode</code></td><td><code>string | HTMLElement</code></td><td>Target container element (when calling <code>ODataUI(options)</code>).</td></tr>
            <tr><td><code>headers</code></td><td><code>Record | () =&gt; Record | Promise</code></td><td>Pass-through HTTP headers for metadata and query requests.</td></tr>
            <tr><td><code>requestInterceptor</code></td><td><code>(req) =&gt; req | Promise</code></td><td>Inspect or rewrite outgoing fetch requests before dispatch.</td></tr>
            <tr><td><code>theme</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td>Color theme; defaults to <code>'auto'</code>.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-card">
        <h2>Theming with CSS Custom Properties</h2>
        <p>
          All styles live inside an open Shadow Root, and CSS variables inherit through Shadow DOM so you can
          recolor the explorer from your host page without forking:
        </p>
        <pre>#explorer {
  --odata-ui-accent: #0f766e;
  --odata-ui-accent-hover: #115e59;
  --odata-ui-radius: 10px;
  --odata-ui-font-sans: 'Inter', system-ui, sans-serif;
}</pre>
      </div>

      <div class="docs-card">
        <h2>Programmatic Core Utilities</h2>
        <p>Use the parser, Metadata Advisor, and query printer headlessly in Node/CI or custom apps:</p>
        <pre>import { parseMetadata, analyzeMetadata, printQuery } from '@odata-ui/core';

const model = parseMetadata(xmlOrJsonMetadata);
const diagnostics = analyzeMetadata(model);
const { readableUrl, fetchUrl } = printQuery('https://example.org/odata', queryAst, {
  version: model.version,
});</pre>
        <button type="button" class="docs-cta" data-preset="https://services.odata.org/TripPinRESTierService">
          Open Live TripPin Demo →
        </button>
      </div>
    `;
  }

  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.preset;
      if (url) callbacks.onOpenPreset(url);
    });
  });

  return root;
}
