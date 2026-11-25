import {
  findComplexType,
  findEntitySet,
  findEntityType,
  findEnumType,
  findSingleton,
  getAllNavigationProperties,
  getAllOperations,
  getAllProperties,
  getAnnotationsForTarget,
  getBaseTypeChain,
  getBoundOperationsForType,
  getDerivedEntityTypes,
  getEffectiveKeys,
  getEntitySetForEntityType,
  getPrimaryContainer,
  isEdmType,
  shortTypeName,
} from '../model/helpers.js';
import type { Annotation, EntityType, MetadataDiagnostic, ODataModel } from '../model/types.js';
import { el } from './dom.js';
import {
  createQueryAstForTarget,
  type ExplorerState,
  type ExplorerStore,
  type Selection,
} from './store.js';

function renderAnnotationsSection(annotations: Annotation[]): HTMLElement | null {
  if (annotations.length === 0) return null;
  const tbody = el('tbody');
  for (const ann of annotations) {
    const valStr =
      typeof ann.value === 'string' ||
      typeof ann.value === 'number' ||
      typeof ann.value === 'boolean'
        ? String(ann.value)
        : JSON.stringify(ann.value, null, 2);
    tbody.appendChild(
      el(
        'tr',
        {},
        el('td', {}, el('code', { class: 'oui-code' }, ann.term)),
        el('td', {}, ann.qualifier ?? '—'),
        el(
          'td',
          {},
          typeof ann.value === 'object' && ann.value !== null
            ? el('pre', { class: 'oui-pre', style: 'margin:0; padding:5px 8px;' }, valStr)
            : valStr,
        ),
      ),
    );
  }
  return el(
    'section',
    { class: 'oui-section' },
    el('h3', { class: 'oui-section-title' }, `Annotations (${annotations.length})`),
    el(
      'div',
      { class: 'oui-table-wrap' },
      el(
        'table',
        { class: 'oui-table' },
        el(
          'thead',
          {},
          el('tr', {}, el('th', {}, 'Term'), el('th', {}, 'Qualifier'), el('th', {}, 'Value')),
        ),
        tbody,
      ),
    ),
  );
}

function renderScopedDiagnostics(
  diagnostics: MetadataDiagnostic[],
  targetIds: string[],
  store: ExplorerStore,
): HTMLElement | null {
  const matched = diagnostics.filter((d) => d.target && targetIds.includes(d.target));
  if (matched.length === 0) return null;

  const list = el('div');
  for (const d of matched) {
    const sevCls =
      d.severity === 'error'
        ? 'oui-badge-danger'
        : d.severity === 'warning'
          ? 'oui-badge-warning'
          : 'oui-badge-tip';
    list.appendChild(
      el(
        'div',
        { class: 'oui-advisor-card' },
        el(
          'div',
          { class: 'oui-advisor-card-head' },
          el('span', { class: `oui-badge ${sevCls}` }, d.severity.toUpperCase()),
          el('strong', {}, d.title),
        ),
        el('div', {}, d.message),
        el('p', { class: 'oui-advisor-why' }, d.whyItMatters),
      ),
    );
  }

  const openAll = el(
    'button',
    { type: 'button', class: 'oui-link' },
    'View all in Metadata Advisor →',
  );
  openAll.addEventListener('click', () => store.setState({ activeTab: 'advisor' }));

  return el(
    'section',
    { class: 'oui-section' },
    el(
      'div',
      {
        style:
          'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;',
      },
      el(
        'h3',
        { class: 'oui-section-title', style: 'margin:0;' },
        `Metadata Advisor (${matched.length})`,
      ),
      openAll,
    ),
    list,
  );
}

function renderTypeLink(
  model: ODataModel,
  typeName: string,
  isCollection: boolean,
  store: ExplorerStore,
): HTMLElement {
  const label = isCollection ? `Collection(${shortTypeName(typeName)})` : shortTypeName(typeName);
  if (isEdmType(typeName)) {
    return el('code', { class: 'oui-code' }, label);
  }

  const et = findEntityType(model, typeName);
  const ct = !et ? findComplexType(model, typeName) : undefined;
  const en = !et && !ct ? findEnumType(model, typeName) : undefined;
  const selection: Selection | null = et
    ? { kind: 'entityType', id: et.fullName }
    : ct
      ? { kind: 'complexType', id: ct.fullName }
      : en
        ? { kind: 'enumType', id: en.fullName }
        : null;

  if (!selection) {
    return el('code', { class: 'oui-code' }, label);
  }

  const btn = el('button', { type: 'button', class: 'oui-link' }, label);
  btn.addEventListener('click', () =>
    store.setState({ selected: selection, activeTab: 'details' }),
  );
  return btn;
}

function renderEntityTypeDetails(
  model: ODataModel,
  et: EntityType,
  store: ExplorerStore,
  diagnostics: MetadataDiagnostic[],
  headerLabel?: string,
  containerTarget?: { kind: 'entitySet' | 'singleton'; name: string; annotations: Annotation[] },
): HTMLElement {
  const wrap = el('div');
  const keys = new Set(getEffectiveKeys(model, et));
  const props = getAllProperties(model, et);
  const navs = getAllNavigationProperties(model, et);
  const baseChain = getBaseTypeChain(model, et);
  const derived = getDerivedEntityTypes(model, et);
  const bound = getBoundOperationsForType(model, et);
  const entitySet =
    containerTarget?.kind === 'entitySet'
      ? findEntitySet(model, containerTarget.name)
      : getEntitySetForEntityType(model, et);

  // Header
  const actions = el('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' });
  if (containerTarget || entitySet) {
    const qBtn = el(
      'button',
      { type: 'button', class: 'oui-btn oui-btn-primary' },
      'Query in Builder →',
    );
    qBtn.addEventListener('click', () => {
      const targetKind = containerTarget ? containerTarget.kind : 'entitySet';
      const targetName = containerTarget ? containerTarget.name : entitySet!.name;
      const ast = createQueryAstForTarget(model, targetKind, targetName);
      if (!containerTarget && entitySet && entitySet.entityType !== et.fullName && et.baseType) {
        ast.derivedTypeCast = et.fullName;
      }
      store.updateQueryAst(ast);
      store.setState({ activeTab: 'query' });
    });
    actions.appendChild(qBtn);
  }

  const diagBtn = el('button', { type: 'button', class: 'oui-btn' }, 'Focus in Diagram');
  diagBtn.addEventListener('click', () => {
    store.setState({ diagramFocusType: et.fullName, activeTab: 'diagram' });
  });
  actions.appendChild(diagBtn);

  const badges = el(
    'div',
    { style: 'display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;' },
    containerTarget
      ? el(
          'span',
          { class: 'oui-badge oui-badge-accent' },
          containerTarget.kind === 'singleton' ? 'Singleton' : 'EntitySet',
        )
      : el('span', { class: 'oui-badge oui-badge-accent' }, 'EntityType'),
    et.abstract ? el('span', { class: 'oui-badge oui-badge-warning' }, 'Abstract') : null,
    et.openType ? el('span', { class: 'oui-badge oui-badge-nav' }, 'OpenType') : null,
    et.hasStream ? el('span', { class: 'oui-badge oui-badge-tip' }, 'Media Stream') : null,
    keys.size > 0
      ? el('span', { class: 'oui-badge oui-badge-key' }, `Key: ${[...keys].join(', ')}`)
      : null,
  );

  wrap.appendChild(
    el(
      'div',
      { class: 'oui-detail-header' },
      el(
        'div',
        {},
        el('h2', { class: 'oui-detail-title' }, headerLabel ?? et.name),
        el('div', { class: 'oui-detail-subtitle' }, et.fullName),
        badges,
      ),
      actions,
    ),
  );

  // Inheritance section
  if (baseChain.length > 0 || derived.length > 0) {
    const inhRow = el('div', { style: 'display:flex; flex-direction:column; gap:6px;' });
    if (baseChain.length > 0) {
      const crumb = el(
        'div',
        { style: 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;' },
        el('strong', {}, 'Inherits: '),
      );
      baseChain.forEach((anc, idx) => {
        if (idx > 0) crumb.appendChild(document.createTextNode(' → '));
        const btn = el('button', { type: 'button', class: 'oui-link' }, anc.name);
        btn.addEventListener('click', () =>
          store.setState({ selected: { kind: 'entityType', id: anc.fullName } }),
        );
        crumb.appendChild(btn);
      });
      inhRow.appendChild(crumb);
    }
    if (derived.length > 0) {
      const subRow = el(
        'div',
        { style: 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;' },
        el('strong', {}, 'Derived types: '),
      );
      derived.forEach((d) => {
        const btn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, d.name);
        btn.addEventListener('click', () =>
          store.setState({ selected: { kind: 'entityType', id: d.fullName } }),
        );
        subRow.appendChild(btn);
      });
      inhRow.appendChild(subRow);
    }
    wrap.appendChild(
      el(
        'section',
        { class: 'oui-section' },
        el('h3', { class: 'oui-section-title' }, 'Inheritance'),
        inhRow,
      ),
    );
  }

  // Properties table
  const propBody = el('tbody');
  for (const p of props) {
    const pAnn = getAnnotationsForTarget(model, `${p.declaredOn}/${p.name}`, p.annotations);
    const facets: string[] = [];
    if (!p.nullable) facets.push('Non-null');
    if (p.maxLength !== undefined) facets.push(`MaxLen ${p.maxLength}`);
    if (p.precision !== undefined)
      facets.push(`P${p.precision}${p.scale !== undefined ? `,S${p.scale}` : ''}`);
    if (p.inherited) facets.push(`from ${shortTypeName(p.declaredOn)}`);
    for (const a of pAnn) {
      facets.push(shortTypeName(a.term));
    }

    propBody.appendChild(
      el(
        'tr',
        {},
        el(
          'td',
          {},
          el('strong', {}, p.name),
          keys.has(p.name)
            ? el('span', { class: 'oui-badge oui-badge-key', style: 'margin-left:6px;' }, 'KEY')
            : null,
        ),
        el('td', {}, renderTypeLink(model, p.type, p.isCollection, store)),
        el('td', {}, p.nullable ? 'Yes' : 'No'),
        el(
          'td',
          {},
          facets.length > 0
            ? el(
                'div',
                { style: 'display:flex; gap:4px; flex-wrap:wrap;' },
                ...facets.map((f) => el('span', { class: 'oui-badge' }, f)),
              )
            : el('span', { class: 'oui-null' }, '—'),
        ),
      ),
    );
  }
  wrap.appendChild(
    el(
      'section',
      { class: 'oui-section' },
      el('h3', { class: 'oui-section-title' }, `Properties (${props.length})`),
      el(
        'div',
        { class: 'oui-table-wrap' },
        el(
          'table',
          { class: 'oui-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', {}, 'Name'),
              el('th', {}, 'Type'),
              el('th', {}, 'Nullable'),
              el('th', {}, 'Facets & Annotations'),
            ),
          ),
          propBody,
        ),
      ),
    ),
  );

  // Navigation Properties
  if (navs.length > 0) {
    const navBody = el('tbody');
    for (const n of navs) {
      navBody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, el('strong', {}, n.name)),
          el('td', {}, renderTypeLink(model, n.type, n.isCollection, store)),
          el(
            'td',
            {},
            el(
              'span',
              { class: 'oui-badge oui-badge-nav' },
              n.isCollection ? '0..*' : n.nullable ? '0..1' : '1',
            ),
          ),
          el(
            'td',
            {},
            n.containsTarget
              ? el(
                  'span',
                  { class: 'oui-badge oui-badge-warning', style: 'margin-right:4px;' },
                  'ContainsTarget',
                )
              : null,
            n.partner
              ? el(
                  'span',
                  { class: 'oui-badge', style: 'margin-right:4px;' },
                  `Partner: ${n.partner}`,
                )
              : null,
            n.inherited
              ? el('span', { class: 'oui-badge' }, `from ${shortTypeName(n.declaredOn)}`)
              : null,
            !n.containsTarget && !n.partner && !n.inherited
              ? el('span', { class: 'oui-null' }, '—')
              : null,
          ),
        ),
      );
    }
    wrap.appendChild(
      el(
        'section',
        { class: 'oui-section' },
        el('h3', { class: 'oui-section-title' }, `Navigation Properties (${navs.length})`),
        el(
          'div',
          { class: 'oui-table-wrap' },
          el(
            'table',
            { class: 'oui-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', {}, 'Name'),
                el('th', {}, 'Target'),
                el('th', {}, 'Cardinality'),
                el('th', {}, 'Notes'),
              ),
            ),
            navBody,
          ),
        ),
      ),
    );
  }

  // Bound operations
  const allBound = [...bound.entityBound, ...bound.collectionBound];
  if (allBound.length > 0) {
    const opBody = el('tbody');
    for (const op of allBound) {
      const nonBindingParams = op.parameters.slice(1);
      const sig = `${op.name}(${nonBindingParams.map((p) => `${p.name}: ${shortTypeName(p.type)}`).join(', ')})`;
      opBody.appendChild(
        el(
          'tr',
          {},
          el(
            'td',
            {},
            el(
              'span',
              {
                class: `oui-badge ${op.kind === 'action' ? 'oui-badge-warning' : 'oui-badge-nav'}`,
              },
              op.kind.toUpperCase(),
            ),
          ),
          el('td', {}, el('code', { class: 'oui-code' }, sig)),
          el('td', {}, op.parameters[0]?.isCollection ? 'Collection' : 'Entity'),
          el(
            'td',
            {},
            op.returnType
              ? renderTypeLink(model, op.returnType.type, op.returnType.isCollection, store)
              : 'void',
          ),
        ),
      );
    }
    wrap.appendChild(
      el(
        'section',
        { class: 'oui-section' },
        el('h3', { class: 'oui-section-title' }, `Bound Operations (${allBound.length})`),
        el(
          'div',
          { class: 'oui-table-wrap' },
          el(
            'table',
            { class: 'oui-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', {}, 'Kind'),
                el('th', {}, 'Signature'),
                el('th', {}, 'Binding'),
                el('th', {}, 'Returns'),
              ),
            ),
            opBody,
          ),
        ),
      ),
    );
  }

  // Annotations
  const mergedAnn = [
    ...(containerTarget?.annotations ?? []),
    ...getAnnotationsForTarget(model, et.fullName, et.annotations),
  ];
  const annSection = renderAnnotationsSection(mergedAnn);
  if (annSection) wrap.appendChild(annSection);

  // Scoped Metadata Advisor diagnostics
  const targetIds = [et.fullName, ...(containerTarget ? [containerTarget.name] : [])];
  const scopedDiag = renderScopedDiagnostics(diagnostics, targetIds, store);
  if (scopedDiag) wrap.appendChild(scopedDiag);

  return wrap;
}

export function renderDetailsView(state: ExplorerState, store: ExplorerStore): HTMLElement {
  if (!state.model) {
    if (state.metadataError) {
      return el(
        'div',
        { class: 'oui-empty' },
        el(
          'div',
          { class: 'oui-banner oui-banner-error', style: 'width:100%;' },
          el(
            'div',
            {},
            el(
              'strong',
              { style: 'display:block; margin-bottom:4px;' },
              'Unable to load $metadata',
            ),
            state.metadataError,
          ),
        ),
        el(
          'p',
          { style: 'margin:0; font-size:12.5px; color:var(--odata-ui-text-secondary);' },
          'Tip: You can still inspect any OData v2, v3, or v4 schema offline using the "Upload XML" button in the toolbar above.',
        ),
      );
    }
    return el(
      'div',
      { class: 'oui-empty' },
      el(
        'strong',
        { style: 'font-size:15px; color:var(--odata-ui-text);' },
        'Inspect any OData service',
      ),
      el(
        'p',
        { style: 'margin:0;' },
        'Enter an OData service root URL (or /$metadata URL) above and select Load, or upload a local XML/JSON CSDL document to browse types, diagrams, and Metadata Advisor diagnostics offline.',
      ),
    );
  }

  const model = state.model;
  const sel = state.selected;
  if (!sel) {
    return el('div', { class: 'oui-empty' }, 'Select an item from the metadata tree on the left.');
  }

  const container = getPrimaryContainer(model);

  if (sel.kind === 'entitySet') {
    const es = findEntitySet(model, sel.id);
    const et = es ? findEntityType(model, es.entityType) : undefined;
    if (es && et) {
      const targetPath = container ? `${container.fullName}/${es.name}` : es.name;
      const esAnn = getAnnotationsForTarget(model, targetPath, es.annotations);
      return renderEntityTypeDetails(model, et, store, state.diagnostics, es.name, {
        kind: 'entitySet',
        name: es.name,
        annotations: esAnn,
      });
    }
  }

  if (sel.kind === 'singleton') {
    const sing = findSingleton(model, sel.id);
    const et = sing ? findEntityType(model, sing.type) : undefined;
    if (sing && et) {
      const targetPath = container ? `${container.fullName}/${sing.name}` : sing.name;
      const singAnn = getAnnotationsForTarget(model, targetPath, sing.annotations);
      return renderEntityTypeDetails(model, et, store, state.diagnostics, sing.name, {
        kind: 'singleton',
        name: sing.name,
        annotations: singAnn,
      });
    }
  }

  if (sel.kind === 'entityType') {
    const et = findEntityType(model, sel.id);
    if (et) return renderEntityTypeDetails(model, et, store, state.diagnostics);
  }

  if (sel.kind === 'complexType') {
    const ct = findComplexType(model, sel.id);
    if (ct) {
      const props = getAllProperties(model, ct);
      const tbody = el('tbody');
      for (const p of props) {
        tbody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, el('strong', {}, p.name)),
            el('td', {}, renderTypeLink(model, p.type, p.isCollection, store)),
            el('td', {}, p.nullable ? 'Yes' : 'No'),
          ),
        );
      }
      const wrap = el(
        'div',
        {},
        el(
          'div',
          { class: 'oui-detail-header' },
          el(
            'div',
            {},
            el('h2', { class: 'oui-detail-title' }, ct.name),
            el('div', { class: 'oui-detail-subtitle' }, ct.fullName),
            el(
              'div',
              { style: 'margin-top:6px;' },
              el('span', { class: 'oui-badge oui-badge-nav' }, 'ComplexType'),
            ),
          ),
        ),
        el(
          'section',
          { class: 'oui-section' },
          el('h3', { class: 'oui-section-title' }, `Properties (${props.length})`),
          el(
            'div',
            { class: 'oui-table-wrap' },
            el(
              'table',
              { class: 'oui-table' },
              el(
                'thead',
                {},
                el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Type'), el('th', {}, 'Nullable')),
              ),
              tbody,
            ),
          ),
        ),
      );
      const ann = renderAnnotationsSection(
        getAnnotationsForTarget(model, ct.fullName, ct.annotations),
      );
      if (ann) wrap.appendChild(ann);
      return wrap;
    }
  }

  if (sel.kind === 'enumType') {
    const en = findEnumType(model, sel.id);
    if (en) {
      const tbody = el('tbody');
      for (const m of en.members) {
        tbody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, el('strong', {}, m.name)),
            el('td', { class: 'oui-num' }, m.value ?? '—'),
          ),
        );
      }
      return el(
        'div',
        {},
        el(
          'div',
          { class: 'oui-detail-header' },
          el(
            'div',
            {},
            el('h2', { class: 'oui-detail-title' }, en.name),
            el('div', { class: 'oui-detail-subtitle' }, en.fullName),
            el(
              'div',
              { style: 'display:flex; gap:6px; margin-top:6px;' },
              el('span', { class: 'oui-badge oui-badge-tip' }, 'EnumType'),
              el('span', { class: 'oui-badge' }, en.underlyingType),
              en.isFlags ? el('span', { class: 'oui-badge oui-badge-warning' }, 'Flags') : null,
            ),
          ),
        ),
        el(
          'section',
          { class: 'oui-section' },
          el('h3', { class: 'oui-section-title' }, `Members (${en.members.length})`),
          el(
            'div',
            { class: 'oui-table-wrap' },
            el(
              'table',
              { class: 'oui-table' },
              el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Value'))),
              tbody,
            ),
          ),
        ),
      );
    }
  }

  if (sel.kind === 'operation') {
    const op = getAllOperations(model).find((o) => o.fullName === sel.id || o.name === sel.id);
    if (op) {
      const fi = container?.functionImports.find((f) => f.function === op.fullName);
      const ai = container?.actionImports.find((a) => a.action === op.fullName);
      const runBtn =
        fi || ai
          ? el(
              'button',
              {
                type: 'button',
                class: `oui-btn ${ai ? 'oui-btn-danger' : 'oui-btn-primary'}`,
              },
              ai ? 'Open POST Action →' : 'Run Function in Builder →',
            )
          : null;
      if (runBtn && (fi || ai)) {
        runBtn.addEventListener('click', () => {
          const ast = createQueryAstForTarget(
            model,
            ai ? 'actionImport' : 'functionImport',
            (ai ?? fi)!.name,
          );
          store.updateQueryAst(ast);
          store.setState({ activeTab: 'query' });
        });
      }

      const pBody = el('tbody');
      for (const p of op.parameters) {
        pBody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, el('strong', {}, p.name)),
            el('td', {}, renderTypeLink(model, p.type, p.isCollection, store)),
            el('td', {}, p.nullable ? 'Yes' : 'No'),
          ),
        );
      }

      const wrap = el(
        'div',
        {},
        el(
          'div',
          { class: 'oui-detail-header' },
          el(
            'div',
            {},
            el('h2', { class: 'oui-detail-title' }, op.name),
            el('div', { class: 'oui-detail-subtitle' }, op.fullName),
            el(
              'div',
              { style: 'display:flex; gap:6px; margin-top:6px;' },
              el(
                'span',
                {
                  class: `oui-badge ${op.kind === 'action' ? 'oui-badge-warning' : 'oui-badge-nav'}`,
                },
                op.kind === 'action' ? 'POST Action' : 'GET Function',
              ),
              el('span', { class: 'oui-badge' }, op.isBound ? 'Bound' : 'Unbound'),
              op.isComposable
                ? el('span', { class: 'oui-badge oui-badge-success' }, 'Composable')
                : null,
            ),
          ),
          runBtn,
        ),
        el(
          'section',
          { class: 'oui-section' },
          el('h3', { class: 'oui-section-title' }, 'Return Type'),
          op.returnType
            ? renderTypeLink(model, op.returnType.type, op.returnType.isCollection, store)
            : el('span', { class: 'oui-null' }, 'void (no content)'),
        ),
        op.parameters.length > 0
          ? el(
              'section',
              { class: 'oui-section' },
              el('h3', { class: 'oui-section-title' }, `Parameters (${op.parameters.length})`),
              el(
                'div',
                { class: 'oui-table-wrap' },
                el(
                  'table',
                  { class: 'oui-table' },
                  el(
                    'thead',
                    {},
                    el(
                      'tr',
                      {},
                      el('th', {}, 'Name'),
                      el('th', {}, 'Type'),
                      el('th', {}, 'Nullable'),
                    ),
                  ),
                  pBody,
                ),
              ),
            )
          : null,
      );

      const scopedDiag = renderScopedDiagnostics(state.diagnostics, [op.fullName], store);
      if (scopedDiag) wrap.appendChild(scopedDiag);
      return wrap;
    }
  }

  return el('div', { class: 'oui-empty' }, 'Unable to resolve the selected metadata item.');
}
