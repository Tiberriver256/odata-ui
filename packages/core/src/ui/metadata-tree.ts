import {
  getAllComplexTypes,
  getAllEntitySets,
  getAllEntityTypes,
  getAllEnumTypes,
  getAllOperations,
  getAllSingletons,
  getPrimaryContainer,
} from '../model/helpers.js';
import type { ODataModel } from '../model/types.js';
import { el } from './dom.js';
import {
  createQueryAstForTarget,
  type ExplorerState,
  type ExplorerStore,
  type Selection,
} from './store.js';

interface TreeEntry {
  label: string;
  sublabel?: string;
  selection: Selection;
  queryTarget?: {
    kind: 'entitySet' | 'singleton' | 'functionImport' | 'actionImport';
    name: string;
  };
}

export function renderMetadataTree(state: ExplorerState, store: ExplorerStore): HTMLElement {
  const sidebar = el('aside', { class: 'oui-sidebar' });

  const searchInput = el('input', {
    type: 'search',
    class: 'oui-input',
    placeholder: 'Filter sets, types, ops…',
    value: state.treeFilter,
    'aria-label': 'Filter metadata tree',
  });
  searchInput.addEventListener('input', () => {
    store.setState({ treeFilter: searchInput.value });
  });

  sidebar.appendChild(el('div', { class: 'oui-sidebar-search' }, searchInput));

  const scroll = el('div', { class: 'oui-tree-scroll' });
  sidebar.appendChild(scroll);

  if (!state.model) {
    scroll.appendChild(
      el(
        'div',
        { class: 'oui-empty', style: 'padding: 28px 12px;' },
        state.loadingMetadata
          ? 'Fetching $metadata…'
          : 'Load an OData service to inspect its model.',
      ),
    );
    return sidebar;
  }

  const model: ODataModel = state.model;
  const query = state.treeFilter.trim().toLowerCase();
  const container = getPrimaryContainer(model);

  const groups: Array<{ title: string; items: TreeEntry[] }> = [
    {
      title: 'Entity Sets',
      items: getAllEntitySets(model).map((es) => ({
        label: es.name,
        selection: { kind: 'entitySet', id: es.name },
        queryTarget: { kind: 'entitySet', name: es.name },
      })),
    },
    {
      title: 'Singletons',
      items: getAllSingletons(model).map((s) => ({
        label: s.name,
        selection: { kind: 'singleton', id: s.name },
        queryTarget: { kind: 'singleton', name: s.name },
      })),
    },
    {
      title: 'Functions & Actions',
      items: [
        ...(container?.functionImports ?? []).map((fi) => ({
          label: fi.name,
          sublabel: 'FN',
          selection: { kind: 'operation' as const, id: fi.function },
          queryTarget: { kind: 'functionImport' as const, name: fi.name },
        })),
        ...(container?.actionImports ?? []).map((ai) => ({
          label: ai.name,
          sublabel: 'ACT',
          selection: { kind: 'operation' as const, id: ai.action },
          queryTarget: { kind: 'actionImport' as const, name: ai.name },
        })),
        ...getAllOperations(model)
          .filter((op) => op.isBound)
          .map((op) => ({
            label: op.name,
            sublabel: op.kind === 'action' ? 'POST' : 'FN',
            selection: { kind: 'operation' as const, id: op.fullName },
          })),
      ],
    },
    {
      title: 'Entity Types',
      items: getAllEntityTypes(model).map((et) => ({
        label: et.name,
        selection: { kind: 'entityType', id: et.fullName },
      })),
    },
    {
      title: 'Complex Types',
      items: getAllComplexTypes(model).map((ct) => ({
        label: ct.name,
        selection: { kind: 'complexType', id: ct.fullName },
      })),
    },
    {
      title: 'Enums',
      items: getAllEnumTypes(model).map((en) => ({
        label: en.name,
        selection: { kind: 'enumType', id: en.fullName },
      })),
    },
  ];

  for (const group of groups) {
    const filtered = query
      ? group.items.filter((i) => i.label.toLowerCase().includes(query))
      : group.items;
    if (filtered.length === 0) continue;

    const list = el('ul', { class: 'oui-tree-items' });
    for (const item of filtered) {
      const isActive =
        state.selected?.kind === item.selection.kind && state.selected?.id === item.selection.id;

      const li = el(
        'li',
        { class: `oui-tree-item${isActive ? ' active' : ''}` },
        el('span', { class: 'oui-tree-item-label', title: item.selection.id }, item.label),
        item.sublabel
          ? el(
              'span',
              {
                class: `oui-badge ${item.sublabel === 'ACT' || item.sublabel === 'POST' ? 'oui-badge-warning' : 'oui-badge-nav'}`,
              },
              item.sublabel,
            )
          : null,
      );

      if (item.queryTarget) {
        const qTarget = item.queryTarget;
        const qBtn = el(
          'button',
          { type: 'button', class: 'oui-btn oui-btn-sm oui-tree-query-btn' },
          'Query',
        );
        qBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const ast = createQueryAstForTarget(model, qTarget.kind, qTarget.name);
          store.updateQueryAst(ast);
          store.setState({
            selected: item.selection,
            activeTab: 'query',
            sidebarOpenMobile: false,
          });
        });
        li.appendChild(qBtn);
      }

      li.addEventListener('click', () => {
        if (item.queryTarget) {
          const ast = createQueryAstForTarget(model, item.queryTarget.kind, item.queryTarget.name);
          store.updateQueryAst(ast);
        }
        store.setState({
          selected: item.selection,
          activeTab: state.activeTab === 'diagram' ? 'diagram' : 'details',
          sidebarOpenMobile: false,
        });
      });

      list.appendChild(li);
    }

    const header = el(
      'button',
      { type: 'button', class: 'oui-tree-group-header' },
      el('span', {}, group.title),
      el('span', { class: 'oui-badge' }, filtered.length),
    );
    header.addEventListener('click', () => {
      list.style.display = list.style.display === 'none' ? '' : 'none';
    });

    scroll.appendChild(el('div', { class: 'oui-tree-group' }, header, list));
  }

  return sidebar;
}
