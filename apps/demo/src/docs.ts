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
      <header class="docs-header">
        <h1>Writing Better OData <code>$metadata</code></h1>
        <p>
          An OData service is only as discoverable as its CSDL <code>$metadata</code> document.
          The built-in <strong>Advisor</strong> tab in <code>odata-ui</code> audits live or uploaded
          metadata and highlights the vocabulary annotations and schema details that matter most
          for clients, code generators, and explorers.
        </p>
      </header>

      <section class="docs-section">
        <h2>Declare <code>Org.OData.Capabilities.V1</code> on every EntitySet</h2>
        <p>
          Without Capabilities annotations, clients have no way to know whether <code>$filter</code>,
          <code>$search</code>, <code>$expand</code>, or writes are supported until requests fail at
          runtime with <code>400</code> or <code>501</code>.
        </p>
        <pre><code>&lt;EntitySet Name="People" EntityType="Trippin.Person"&gt;
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
&lt;/EntitySet&gt;</code></pre>
        <button type="button" class="docs-cta" data-preset="https://services.odata.org/V4/TripPinServiceRW">
          Inspect Capabilities in TripPin V4 RW
        </button>
      </section>

      <section class="docs-section">
        <h2>Bind non-contained navigation properties</h2>
        <p>
          In OData v4, every non-contained <code>NavigationProperty</code> exposed through an
          <code>EntitySet</code> should declare a <code>&lt;NavigationPropertyBinding&gt;</code>.
          For child entities that only exist inside a parent, set <code>ContainsTarget="true"</code>.
        </p>
        <pre><code>&lt;EntitySet Name="People" EntityType="Trippin.Person"&gt;
  &lt;NavigationPropertyBinding Path="Friends" Target="People" /&gt;
  &lt;NavigationPropertyBinding Path="BestFriend" Target="People" /&gt;
&lt;/EntitySet&gt;</code></pre>
      </section>

      <section class="docs-section">
        <h2>Document types and POST actions with <code>Core.Description</code></h2>
        <p>
          <code>Org.OData.Core.V1.Description</code> turns <code>$metadata</code> into living
          documentation. It is especially important on <code>POST</code> Actions so callers understand
          side effects before invoking them.
        </p>
        <pre><code>&lt;Action Name="ResetDataSource"&gt;
  &lt;Annotation Term="Org.OData.Core.V1.Description"
              String="Resets the session sample database back to its seed state." /&gt;
&lt;/Action&gt;</code></pre>
      </section>

      <section class="docs-section">
        <h2>Tighten keys, inverse relationships, and numeric facets</h2>
        <ul>
          <li><strong>Pair inverse navigations with <code>Partner</code></strong> so diagrams and ORMs recognize bidirectional relationships instead of two unrelated edges.</li>
          <li><strong>Mark keys <code>Nullable="false"</code></strong>: CSDL defaults properties to nullable unless stated explicitly.</li>
          <li><strong>Declare <code>Precision</code> and <code>Scale</code> on <code>Edm.Decimal</code></strong> to avoid rounding drift in BI tools and generated clients.</li>
          <li><strong>Publish <code>Core.OptimisticConcurrency</code></strong> on EntitySets that enforce ETags.</li>
        </ul>
      </section>

      <section class="docs-section">
        <h2>ASP.NET Core OData tip</h2>
        <p>
          With <code>ODataConventionModelBuilder</code>, attach OASIS vocabulary annotations to the
          built <code>IEdmModel</code> before passing it to <code>AddRouteComponents</code> using
          <code>Microsoft.OData.ModelBuilder.CapabilitiesVocabularyConstants</code> and
          <code>CoreVocabularyModel</code>.
        </p>
      </section>
    `;
  } else {
    root.innerHTML = `
      <header class="docs-header">
        <h1><code>odata-ui</code> Documentation</h1>
        <p>
          Drop-in, framework-agnostic OData explorer with Shadow DOM isolation, zero core runtime
          dependencies, v2/v3/v4 CSDL parsing, visual query building, and metadata diagnostics.
        </p>
      </header>

      <section class="docs-section">
        <h2>Standalone script (swagger-ui style)</h2>
        <p>
          The standalone IIFE bundle inlines its Shadow DOM stylesheet and assigns
          <code>globalThis.ODataUI</code> directly as a function.
        </p>
        <pre><code>&lt;div id="explorer" style="height: 85vh"&gt;&lt;/div&gt;
&lt;script src="odata-ui.standalone.js"&gt;&lt;/script&gt;
&lt;script&gt;
  ODataUI({
    url: 'https://services.odata.org/TripPinRESTierService',
    dom_id: 'explorer',
    theme: 'auto',
  });
&lt;/script&gt;</code></pre>
      </section>

      <section class="docs-section">
        <h2>ESM, React, and Vue</h2>
        <h3>Plain TypeScript / ESM</h3>
        <pre><code>import { mount } from '@odata-ui/core';

const instance = mount(document.getElementById('explorer')!, {
  url: 'https://services.odata.org/TripPinRESTierService',
  headers: () =&gt; ({ Authorization: \`Bearer \${getToken()}\` }),
});

instance.unmount();</code></pre>

        <h3>React (<code>@odata-ui/react</code>)</h3>
        <pre><code>import { ODataUI } from '@odata-ui/react';

export function ApiExplorer() {
  return &lt;ODataUI url="https://services.odata.org/TripPinRESTierService" theme="auto" /&gt;;
}</code></pre>

        <h3>Vue 3 (<code>@odata-ui/vue</code>)</h3>
        <pre><code>&lt;script setup lang="ts"&gt;
import { ODataUI } from '@odata-ui/vue';
&lt;/script&gt;

&lt;template&gt;
  &lt;ODataUI url="https://services.odata.org/TripPinRESTierService" /&gt;
&lt;/template&gt;</code></pre>
      </section>

      <section class="docs-section">
        <h2>Options reference</h2>
        <table class="docs-table">
          <thead>
            <tr><th>Option</th><th>Type</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>url</code></td><td><code>string</code></td><td>Service root or <code>/$metadata</code> URL. Redirected session roots are adopted automatically.</td></tr>
            <tr><td><code>metadata</code></td><td><code>string</code></td><td>Raw XML (v2/v3/v4) or JSON CSDL (v4/v4.01) document for offline browsing.</td></tr>
            <tr><td><code>dom_id</code> / <code>domNode</code></td><td><code>string | HTMLElement</code></td><td>Mount container when invoking <code>ODataUI(options)</code>.</td></tr>
            <tr><td><code>headers</code></td><td><code>Record | () =&gt; Record | Promise</code></td><td>Custom HTTP headers forwarded on metadata and data requests.</td></tr>
            <tr><td><code>requestInterceptor</code></td><td><code>(req) =&gt; req | Promise</code></td><td>Modify outgoing fetch requests prior to dispatch.</td></tr>
            <tr><td><code>theme</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td>Color theme; defaults to <code>'auto'</code>.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="docs-section">
        <h2>Theming with CSS custom properties</h2>
        <p>
          Custom properties inherit across the Shadow Root boundary, so any host app can recolor the
          explorer without forking styles:
        </p>
        <pre><code>#explorer {
  --odata-ui-accent: #0d746e;
  --odata-ui-accent-hover: #0a5c57;
  --odata-ui-radius: 6px;
}</code></pre>
      </section>

      <section class="docs-section">
        <h2>Headless core utilities</h2>
        <pre><code>import { parseMetadata, analyzeMetadata, printQuery } from '@odata-ui/core';

const model = parseMetadata(xmlOrJsonMetadata);
const diagnostics = analyzeMetadata(model);
const { readableUrl, fetchUrl } = printQuery('https://example.org/odata', queryAst, {
  version: model.version,
});</code></pre>
        <button type="button" class="docs-cta" data-preset="https://services.odata.org/TripPinRESTierService">
          Open Live TripPin Explorer
        </button>
      </section>
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
