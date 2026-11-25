import {
  findEntitySet,
  findEntityType,
  findSingleton,
  getAllNavigationProperties,
  getAllProperties,
  getEffectiveKeys,
} from '../model/helpers.js';
import type { EntityType, ODataModel } from '../model/types.js';
import { formatTypedValue } from '../query/printer.js';
import { executeQuery, type QueryExecutionResult } from '../client/http.js';
import { copyToClipboard, el, renderHighlightedJson } from './dom.js';
import type { ExplorerState, ExplorerStore, ResultsViewMode } from './store.js';

export interface ResultsCallbacks {
  onFollowNextLink: (nextLink: string) => void;
  onPreviousPage: () => void;
  onOpenNavUrl: (url: string) => void;
}

function isODataMetaKey(key: string): boolean {
  return (
    key.startsWith('@odata.') ||
    key.startsWith('odata.') ||
    key === '__metadata' ||
    key.includes('@odata.')
  );
}

function collectColumns(
  rows: Record<string, unknown>[],
  entityType?: EntityType,
  model?: ODataModel,
): string[] {
  const present = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!isODataMetaKey(k)) present.add(k);
    }
  }

  // Prefer structural columns in model order, then expanded navigation columns, then remaining keys
  const ordered: string[] = [];
  if (entityType && model) {
    for (const p of getAllProperties(model, entityType)) {
      if (present.has(p.name)) {
        ordered.push(p.name);
        present.delete(p.name);
      }
    }
    for (const n of getAllNavigationProperties(model, entityType)) {
      if (present.has(n.name)) {
        ordered.push(n.name);
        present.delete(n.name);
      }
    }
  }
  for (const remaining of present) {
    ordered.push(remaining);
  }
  return ordered;
}

function renderValueCell(value: unknown, depth = 0): HTMLElement {
  if (value === null || value === undefined) {
    return el('td', { class: 'oui-null' }, '—');
  }
  if (typeof value === 'number') {
    return el('td', { class: 'oui-num' }, String(value));
  }
  if (typeof value === 'boolean') {
    return el(
      'td',
      {},
      el('span', { class: `oui-badge ${value ? 'oui-badge-success' : ''}` }, String(value)),
    );
  }
  if (typeof value === 'string') {
    return el('td', {}, value);
  }

  // Array or nested object -> inline expandable widget
  const td = el('td');
  const isArr = Array.isArray(value);
  const items = isArr ? value : [value];
  const summaryLabel = isArr
    ? `${items.length} item${items.length === 1 ? '' : 's'} ▸`
    : `{ ${Object.keys(value as Record<string, unknown>)
        .filter((k) => !isODataMetaKey(k))
        .slice(0, 2)
        .join(', ')}… } ▸`;

  const trigger = el('button', { type: 'button', class: 'oui-nested-trigger' }, summaryLabel);
  let expandedBox: HTMLElement | null = null;

  trigger.addEventListener('click', () => {
    if (expandedBox) {
      expandedBox.remove();
      expandedBox = null;
      trigger.textContent = summaryLabel;
      return;
    }
    trigger.textContent = summaryLabel.replace('▸', '▾');
    expandedBox = el('div', { class: 'oui-nested-box' });

    if (depth >= 3) {
      expandedBox.appendChild(renderHighlightedJson(value));
    } else if (isArr && items.every((i) => typeof i !== 'object' || i === null)) {
      expandedBox.textContent =
        items.length === 0 ? '(empty)' : items.map((i) => String(i ?? '—')).join(', ');
    } else {
      const nestedRows = items.filter((i): i is Record<string, unknown> =>
        Boolean(i && typeof i === 'object'),
      );
      if (nestedRows.length === 0) {
        expandedBox.textContent = '(empty)';
      } else {
        expandedBox.appendChild(
          renderDataTable(nestedRows, undefined, undefined, undefined, undefined, depth + 1),
        );
      }
    }
    td.appendChild(expandedBox);
  });

  td.appendChild(trigger);
  return td;
}

function computeNavLinkForRow(
  row: Record<string, unknown>,
  navName: string,
  state: ExplorerState,
  entityType: EntityType,
): string | null {
  const explicit = row[`${navName}@odata.navigationLink`];
  if (typeof explicit === 'string') {
    return explicit.startsWith('http')
      ? explicit
      : `${state.serviceRoot}/${explicit.replace(/^\/+/, '')}`;
  }
  if (!state.model || !state.queryAst || !state.serviceRoot) return null;
  if (state.queryAst.targetKind === 'singleton') {
    return `${state.serviceRoot}/${state.queryAst.targetName}/${navName}`;
  }
  if (state.queryAst.targetKind !== 'entitySet') return null;

  const keys = getEffectiveKeys(state.model, entityType);
  if (keys.length === 0) return null;
  const props = getAllProperties(state.model, entityType);
  const keyParts: string[] = [];
  for (const k of keys) {
    const val = row[k];
    if (val === undefined || val === null) return null;
    const edmType = props.find((p) => p.name === k)?.type ?? 'Edm.String';
    const formatted = formatTypedValue(String(val), edmType, state.model.version);
    keyParts.push(keys.length === 1 ? formatted : `${k}=${formatted}`);
  }
  return `${state.serviceRoot}/${state.queryAst.targetName}(${keyParts.join(',')})/${navName}`;
}

function renderDataTable(
  rows: Record<string, unknown>[],
  entityType?: EntityType,
  state?: ExplorerState,
  store?: ExplorerStore,
  callbacks?: ResultsCallbacks,
  depth = 0,
): HTMLElement {
  const cols = collectColumns(rows, entityType, state?.model ?? undefined);
  const unexpandedNavs =
    depth === 0 && entityType && state?.model
      ? getAllNavigationProperties(state.model, entityType).filter(
          (n) => !rows.some((r) => r[n.name] !== undefined),
        )
      : [];

  const theadRow = el('tr', {}, ...cols.map((c) => el('th', {}, c)));
  if (unexpandedNavs.length > 0 && state?.serviceRoot) {
    theadRow.appendChild(el('th', {}, 'Related'));
  }

  const tbody = el('tbody');

  for (const row of rows) {
    const tr = el('tr');
    for (const col of cols) {
      tr.appendChild(renderValueCell(row[col], depth));
    }

    if (unexpandedNavs.length > 0 && entityType && state && store && callbacks) {
      const navTd = el('td');
      let drawerRow: HTMLTableRowElement | null = null;

      for (const nav of unexpandedNavs) {
        const navUrl = computeNavLinkForRow(row, nav.name, state, entityType);
        if (!navUrl) continue;

        const chip = el(
          'button',
          { type: 'button', class: 'oui-nav-chip', title: `Fetch ${navUrl}` },
          `${nav.name} →`,
        );
        chip.addEventListener('click', async () => {
          if (drawerRow && drawerRow.dataset.nav === nav.name) {
            drawerRow.remove();
            drawerRow = null;
            return;
          }
          drawerRow?.remove();
          const cell = el('td', { colspan: cols.length + 1 });
          cell.textContent = `Loading ${nav.name}…`;
          drawerRow = el('tr', { 'data-nav': nav.name }, cell);
          tr.after(drawerRow);

          try {
            const res = await executeQuery(navUrl, {
              headers: state.headersProvider,
              extraHeaders: store.getEffectiveExtraHeaders(),
              requestInterceptor: state.requestInterceptor,
              version: state.model?.version,
            });
            cell.textContent = '';
            const openBtn = el(
              'button',
              { type: 'button', class: 'oui-btn oui-btn-sm' },
              'Open URL in Builder',
            );
            openBtn.addEventListener('click', () => callbacks.onOpenNavUrl(navUrl));
            const closeBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Close');
            closeBtn.addEventListener('click', () => {
              drawerRow?.remove();
              drawerRow = null;
            });

            const header = el(
              'div',
              {
                style:
                  'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;',
              },
              el(
                'strong',
                {},
                `${nav.name} (${res.rows.length} row${res.rows.length === 1 ? '' : 's'})`,
              ),
              el('div', { style: 'display:flex; gap:5px;' }, openBtn, closeBtn),
            );
            cell.appendChild(header);
            if (res.rows.length > 0) {
              const targetEt = state.model
                ? findEntityType(state.model, nav.type, entityType.namespace)
                : undefined;
              cell.appendChild(
                renderDataTable(res.rows, targetEt, state, store, callbacks, depth + 1),
              );
            } else {
              cell.appendChild(el('span', { class: 'oui-null' }, 'No related rows returned.'));
            }
          } catch (err) {
            cell.textContent = '';
            cell.appendChild(
              el(
                'div',
                { class: 'oui-banner oui-banner-error', style: 'margin:0;' },
                err instanceof Error ? err.message : String(err),
              ),
            );
          }
        });
        navTd.appendChild(chip);
      }

      tr.appendChild(navTd);
    }

    tbody.appendChild(tr);
  }

  return el(
    'div',
    { class: 'oui-table-wrap' },
    el('table', { class: 'oui-table' }, el('thead', {}, theadRow), tbody),
  );
}

export function renderResultsView(
  state: ExplorerState,
  store: ExplorerStore,
  callbacks: ResultsCallbacks,
): HTMLElement {
  const wrap = el('div');

  if (state.queryError) {
    wrap.appendChild(el('div', { class: 'oui-banner oui-banner-error' }, state.queryError));
  }

  const res: QueryExecutionResult | null = state.queryResult;
  if (!res) {
    if (!state.queryError && !state.queryLoading) {
      wrap.appendChild(
        el(
          'div',
          { class: 'oui-empty', style: 'padding:28px 16px;' },
          'Click "Run Query" to execute against the OData service and inspect the results grid + raw JSON.',
        ),
      );
    }
    return wrap;
  }

  // Active entity type for column ordering & nav links
  let entityType: EntityType | undefined;
  if (state.model && state.queryAst) {
    if (state.queryAst.targetKind === 'entitySet') {
      const es = findEntitySet(state.model, state.queryAst.targetName);
      if (es) entityType = findEntityType(state.model, es.entityType);
    } else if (state.queryAst.targetKind === 'singleton') {
      const s = findSingleton(state.model, state.queryAst.targetName);
      if (s) entityType = findEntityType(state.model, s.type);
    }
    if (state.queryAst.derivedTypeCast) {
      entityType = findEntityType(state.model, state.queryAst.derivedTypeCast) ?? entityType;
    }
  }

  // Results toolbar
  const statusBadge = el(
    'span',
    {
      class: `oui-badge ${res.status >= 200 && res.status < 300 ? 'oui-badge-success' : 'oui-badge-danger'}`,
    },
    `${res.status} ${res.statusText || 'OK'}`,
  );
  const metaText = `${res.rows.length} row${res.rows.length === 1 ? '' : 's'}${res.count !== undefined ? ` of ${res.count}` : ''} · ${res.durationMs} ms`;

  const modeButtons = (['grid', 'json', 'split'] as ResultsViewMode[]).map((mode) => {
    const btn = el(
      'button',
      { type: 'button', class: state.resultsViewMode === mode ? 'active' : '' },
      mode === 'grid' ? 'Grid' : mode === 'json' ? 'Raw JSON' : 'Split',
    );
    btn.addEventListener('click', () => store.setState({ resultsViewMode: mode }));
    return btn;
  });

  const copyJsonBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Copy JSON');
  copyJsonBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(JSON.stringify(res.rawJson, null, 2));
    copyJsonBtn.textContent = ok ? 'Copied!' : 'Failed';
    setTimeout(() => {
      copyJsonBtn.textContent = 'Copy JSON';
    }, 1200);
  });

  const prevBtn =
    state.pageStack.length > 0
      ? el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '← Prev')
      : null;
  prevBtn?.addEventListener('click', callbacks.onPreviousPage);

  const nextBtn = res.nextLink
    ? el('button', { type: 'button', class: 'oui-btn oui-btn-sm oui-btn-primary' }, 'Next Page →')
    : null;
  if (nextBtn && res.nextLink) {
    const link = res.nextLink;
    nextBtn.addEventListener('click', () => callbacks.onFollowNextLink(link));
  }

  wrap.appendChild(
    el(
      'div',
      { class: 'oui-results-bar' },
      el(
        'div',
        { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
        statusBadge,
        el('span', { style: 'color:var(--odata-ui-text-secondary);' }, metaText),
      ),
      el(
        'div',
        { style: 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;' },
        prevBtn,
        nextBtn,
        copyJsonBtn,
        el('div', { class: 'oui-seg' }, ...modeButtons),
      ),
    ),
  );

  const gridPane =
    res.rows.length > 0
      ? renderDataTable(res.rows, entityType, state, store, callbacks)
      : res.scalarValue !== undefined
        ? el('div', { class: 'oui-banner oui-banner-info' }, `Value: ${String(res.scalarValue)}`)
        : el(
            'div',
            { class: 'oui-empty', style: 'padding:24px;' },
            res.status === 204 ? '204 No Content (Action succeeded).' : 'Empty result set.',
          );

  const jsonPane = renderHighlightedJson(res.rawJson);

  if (state.resultsViewMode === 'grid') {
    wrap.appendChild(gridPane);
  } else if (state.resultsViewMode === 'json') {
    wrap.appendChild(jsonPane);
  } else {
    wrap.appendChild(el('div', { class: 'oui-results-split' }, gridPane, jsonPane));
  }

  return wrap;
}
