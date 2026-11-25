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

function buildNestedContent(value: unknown, depth: number): HTMLElement {
  const isArr = Array.isArray(value);
  const items = isArr ? value : [value];
  const container = el('div');

  if (depth >= 3) {
    container.appendChild(renderHighlightedJson(value));
  } else if (isArr && items.every((i) => typeof i !== 'object' || i === null)) {
    container.textContent =
      items.length === 0 ? '(empty)' : items.map((i) => String(i ?? '—')).join(', ');
  } else {
    const nestedRows = items.filter((i): i is Record<string, unknown> =>
      Boolean(i && typeof i === 'object'),
    );
    if (nestedRows.length === 0) {
      container.textContent = '(empty)';
    } else {
      container.appendChild(
        renderDataTable(nestedRows, undefined, undefined, undefined, undefined, depth + 1),
      );
    }
  }

  return container;
}

function renderValueCell(
  value: unknown,
  colName: string,
  rowKey: string,
  totalCols: number,
  parentRow: HTMLTableRowElement,
  depth = 0,
  state?: ExplorerState,
  store?: ExplorerStore,
): { td: HTMLElement; initialDrawerRow?: HTMLTableRowElement } {
  if (value === null || value === undefined) {
    return { td: el('td', { class: 'oui-null' }, '—') };
  }
  if (typeof value === 'number') {
    return { td: el('td', { class: 'oui-num' }, String(value)) };
  }
  if (typeof value === 'boolean') {
    return {
      td: el('td', {}, el('span', { class: 'oui-badge' }, String(value))),
    };
  }
  if (typeof value === 'string') {
    return { td: el('td', {}, value) };
  }

  // Array or nested object -> full-width expandable row below parent row (readable on desktop & mobile)
  const td = el('td');
  const isArr = Array.isArray(value);
  const items = isArr ? value : [value];
  const closedLabel = isArr
    ? `${items.length} item${items.length === 1 ? '' : 's'} ▸`
    : `{ ${Object.keys(value as Record<string, unknown>)
        .filter((k) => !isODataMetaKey(k))
        .slice(0, 2)
        .join(', ')}… } ▸`;
  const openLabel = closedLabel.replace('▸', '▾');
  const expandKey = `${depth}:${rowKey}:${colName}`;

  const trigger = el('button', { type: 'button', class: 'oui-nested-trigger' }, closedLabel);
  let drawerRow: HTMLTableRowElement | null = null;

  const createDrawerRow = (): HTMLTableRowElement => {
    const closeBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Close');
    closeBtn.addEventListener('click', () => {
      drawerRow?.remove();
      drawerRow = null;
      trigger.textContent = closedLabel;
      store?.setNestedKeyExpanded(expandKey, false);
    });

    const headTitle = isArr
      ? `${colName} (${items.length} item${items.length === 1 ? '' : 's'})`
      : colName;
    const drawerContent = el(
      'div',
      { class: 'oui-nested-drawer' },
      el('div', { class: 'oui-nested-row-head' }, el('strong', {}, headTitle), closeBtn),
      buildNestedContent(value, depth),
    );
    const cell = el('td', { colspan: totalCols }, drawerContent);
    return el('tr', { class: 'oui-nested-row', 'data-nested-key': expandKey }, cell);
  };

  trigger.addEventListener('click', () => {
    if (drawerRow) {
      drawerRow.remove();
      drawerRow = null;
      trigger.textContent = closedLabel;
      store?.setNestedKeyExpanded(expandKey, false);
      return;
    }
    trigger.textContent = openLabel;
    drawerRow = createDrawerRow();
    parentRow.after(drawerRow);
    store?.setNestedKeyExpanded(expandKey, true);
  });

  td.appendChild(trigger);

  let initialDrawerRow: HTMLTableRowElement | undefined;
  if (depth === 0 && state?.expandedNestedKeys.includes(expandKey)) {
    trigger.textContent = openLabel;
    drawerRow = createDrawerRow();
    initialDrawerRow = drawerRow;
  }

  return { td, initialDrawerRow };
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
  const hasRelatedCol = Boolean(unexpandedNavs.length > 0 && state?.serviceRoot);
  const totalCols = cols.length + (hasRelatedCol ? 1 : 0);

  const theadRow = el('tr', {}, ...cols.map((c) => el('th', {}, c)));
  if (hasRelatedCol) {
    theadRow.appendChild(el('th', {}, 'Related'));
  }

  const tbody = el('tbody');

  rows.forEach((row, rowIdx) => {
    const rowKey = String(rowIdx);
    const tr = el('tr');
    const pendingDrawers: HTMLTableRowElement[] = [];

    for (const col of cols) {
      const { td, initialDrawerRow } = renderValueCell(
        row[col],
        col,
        rowKey,
        totalCols,
        tr,
        depth,
        state,
        store,
      );
      tr.appendChild(td);
      if (initialDrawerRow) {
        pendingDrawers.push(initialDrawerRow);
      }
    }

    if (hasRelatedCol && entityType && state && store && callbacks) {
      const navTd = el('td');
      let drawerRow: HTMLTableRowElement | null = null;

      const populateNavDrawer = (
        cell: HTMLElement,
        navName: string,
        navUrl: string,
        res: QueryExecutionResult,
        targetTypeName?: string,
      ) => {
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
          store.setExpandedNavDrawer(rowKey, null);
        });

        const header = el(
          'div',
          { class: 'oui-nested-row-head' },
          el(
            'strong',
            {},
            `${navName} (${res.rows.length} row${res.rows.length === 1 ? '' : 's'})`,
          ),
          el('div', { style: 'display:flex; gap:5px; flex-wrap:wrap;' }, openBtn, closeBtn),
        );

        const bodyEl =
          res.rows.length > 0
            ? renderDataTable(
                res.rows,
                state.model && targetTypeName
                  ? findEntityType(state.model, targetTypeName, entityType.namespace)
                  : undefined,
                state,
                store,
                callbacks,
                depth + 1,
              )
            : el('span', { class: 'oui-null' }, 'No related rows returned.');

        cell.appendChild(el('div', { class: 'oui-nested-drawer' }, header, bodyEl));
      };

      // Restore cached on-demand nav drawer across Grid / Raw JSON / Split toggles
      const savedNav = state.expandedNavDrawers[rowKey];
      if (savedNav) {
        const cell = el('td', { colspan: totalCols });
        drawerRow = el('tr', { class: 'oui-nested-row', 'data-nav': savedNav.navName }, cell);
        populateNavDrawer(
          cell,
          savedNav.navName,
          savedNav.navUrl,
          savedNav.result,
          savedNav.targetTypeName,
        );
        pendingDrawers.push(drawerRow);
      }

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
            store.setExpandedNavDrawer(rowKey, null);
            return;
          }
          drawerRow?.remove();
          const cell = el(
            'td',
            { colspan: totalCols },
            el('div', { class: 'oui-nested-drawer' }, `Loading ${nav.name}…`),
          );
          drawerRow = el('tr', { class: 'oui-nested-row', 'data-nav': nav.name }, cell);
          tr.after(drawerRow);

          try {
            const res = await executeQuery(navUrl, {
              headers: state.headersProvider,
              extraHeaders: store.getEffectiveExtraHeaders(),
              requestInterceptor: state.requestInterceptor,
              version: state.model?.version,
            });
            store.setExpandedNavDrawer(rowKey, {
              navName: nav.name,
              navUrl,
              targetTypeName: nav.type,
              result: res,
            });
            populateNavDrawer(cell, nav.name, navUrl, res, nav.type);
          } catch (err) {
            cell.textContent = '';
            cell.appendChild(
              el(
                'div',
                { class: 'oui-nested-drawer' },
                el(
                  'div',
                  { class: 'oui-banner oui-banner-error', style: 'margin:0;' },
                  err instanceof Error ? err.message : String(err),
                ),
              ),
            );
          }
        });
        navTd.appendChild(chip);
      }

      tr.appendChild(navTd);
    }

    tbody.appendChild(tr);
    for (const dRow of pendingDrawers) {
      tbody.appendChild(dRow);
    }
  });

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
    wrap.appendChild(
      el('div', { class: 'oui-banner oui-banner-error oui-results-error' }, state.queryError),
    );
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
