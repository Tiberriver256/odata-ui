import type { DiagnosticSeverity } from '../model/types.js';
import { copyToClipboard, el } from './dom.js';
import { icon } from './icons.js';
import type { ExplorerState, ExplorerStore, Selection } from './store.js';

let activeSeverityFilter: DiagnosticSeverity | 'all' = 'all';

export function renderAdvisorView(state: ExplorerState, store: ExplorerStore): HTMLElement {
  if (!state.model) {
    return el(
      'div',
      { class: 'oui-empty' },
      'Load an OData service to inspect metadata quality diagnostics.',
    );
  }

  const diags = state.diagnostics;
  const errs = diags.filter((d) => d.severity === 'error').length;
  const warns = diags.filter((d) => d.severity === 'warning').length;
  const tips = diags.filter((d) => d.severity === 'tip').length;

  const wrap = el('div');

  wrap.appendChild(
    el(
      'div',
      { class: 'oui-detail-header' },
      el(
        'div',
        {},
        el('h2', { class: 'oui-detail-title' }, 'OData Metadata Advisor'),
        el(
          'div',
          { class: 'oui-detail-subtitle', style: 'font-family:var(--odata-ui-font-sans);' },
          'Actionable CSDL checks to help API builders publish richer, more discoverable OData services.',
        ),
      ),
    ),
  );

  // Filter buttons
  const filters: Array<{ id: DiagnosticSeverity | 'all'; label: string }> = [
    { id: 'all', label: `All (${diags.length})` },
    { id: 'error', label: `Errors (${errs})` },
    { id: 'warning', label: `Warnings (${warns})` },
    { id: 'tip', label: `Tips (${tips})` },
  ];

  const filterBar = el('div', { class: 'oui-advisor-summary' });
  for (const f of filters) {
    const btn = el(
      'button',
      {
        type: 'button',
        class: `oui-chip${activeSeverityFilter === f.id ? ' active' : ''}`,
      },
      f.label,
    );
    btn.addEventListener('click', () => {
      activeSeverityFilter = f.id;
      store.setState({});
    });
    filterBar.appendChild(btn);
  }
  wrap.appendChild(filterBar);

  const visible =
    activeSeverityFilter === 'all'
      ? diags
      : diags.filter((d) => d.severity === activeSeverityFilter);

  if (visible.length === 0) {
    wrap.appendChild(
      el(
        'div',
        { class: 'oui-banner oui-banner-info' },
        activeSeverityFilter === 'all'
          ? 'No metadata diagnostics found — this $metadata document looks very healthy!'
          : `No ${activeSeverityFilter} diagnostics found for this service.`,
      ),
    );
    return wrap;
  }

  for (const d of visible) {
    const sevCls =
      d.severity === 'error'
        ? 'oui-badge-danger'
        : d.severity === 'warning'
          ? 'oui-badge-warning'
          : 'oui-badge-tip';

    let targetEl: HTMLElement | null = null;
    if (d.target && d.targetKind && d.targetKind !== 'service') {
      const sel: Selection = { kind: d.targetKind, id: d.target };
      const link = el('button', { type: 'button', class: 'oui-link' }, d.target);
      link.addEventListener('click', () => store.setState({ selected: sel, activeTab: 'details' }));
      targetEl = link;
    }

    let exampleBlock: HTMLElement | null = null;
    if (d.exampleCsdl) {
      const snippet = d.exampleCsdl;
      const copyBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Copy CSDL');
      copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboard(snippet);
        copyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => {
          copyBtn.textContent = 'Copy CSDL';
        }, 1400);
      });

      const chev = icon('chevron-down', 13);
      chev.classList.add('oui-details-chevron');
      const details = el(
        'details',
        { class: 'oui-advisor-details' },
        el('summary', {}, chev, 'Example CSDL improvement'),
        el('div', { style: 'margin-top:6px;' }, copyBtn, el('pre', { class: 'oui-pre' }, snippet)),
      );
      exampleBlock = details;
    }

    wrap.appendChild(
      el(
        'div',
        { class: 'oui-advisor-card' },
        el(
          'div',
          { class: 'oui-advisor-card-head' },
          el('span', { class: `oui-badge ${sevCls}` }, d.severity.toUpperCase()),
          el('span', { class: 'oui-badge' }, d.category),
          el('strong', {}, d.title),
          targetEl,
        ),
        el('div', {}, d.message),
        el('p', { class: 'oui-advisor-why' }, el('strong', {}, 'Why it matters: '), d.whyItMatters),
        exampleBlock,
      ),
    );
  }

  return wrap;
}
