import {
  findEntitySet,
  findEntityType,
  findSingleton,
  getAllEntitySets,
  getAllNavigationProperties,
  getAllOperations,
  getAllProperties,
  getAllSingletons,
  getBoundOperationsForType,
  getDerivedEntityTypes,
  getFilterablePropertyPaths,
  getPrimaryContainer,
  type FlattenedPropertyOption,
} from '../model/helpers.js';
import type { EntityType, ODataModel } from '../model/types.js';
import { printQuery } from '../query/printer.js';
import type {
  AggregateMethod,
  ComparisonOp,
  ExpandNode,
  FilterGroupNode,
  FilterNode,
  LiteralValue,
  QueryAst,
  RelativeDatePreset,
  StringFn,
} from '../query/types.js';
import { copyToClipboard, el } from './dom.js';
import { icon } from './icons.js';
import { createQueryAstForTarget, type ExplorerState, type ExplorerStore } from './store.js';

export interface QueryBuilderCallbacks {
  onRunQuery: (url: string, method: 'GET' | 'POST', body?: Record<string, unknown>) => void;
}

type OpChoice = ComparisonOp | StringFn | 'in' | 'isNull' | 'isNotNull';

function getOperatorsForOption(
  opt: FlattenedPropertyOption,
): Array<{ id: OpChoice; label: string }> {
  if (opt.isEnum || opt.edmType === 'Edm.Boolean') {
    return [
      { id: 'eq', label: 'equals (=)' },
      { id: 'ne', label: 'not equals (≠)' },
      { id: 'in', label: 'in list' },
      { id: 'isNull', label: 'is null' },
      { id: 'isNotNull', label: 'is not null' },
    ];
  }
  if (opt.edmType === 'Edm.String') {
    return [
      { id: 'eq', label: 'equals' },
      { id: 'ne', label: 'not equals' },
      { id: 'contains', label: 'contains' },
      { id: 'startswith', label: 'starts with' },
      { id: 'endswith', label: 'ends with' },
      { id: 'in', label: 'in list' },
      { id: 'isNull', label: 'is null' },
      { id: 'isNotNull', label: 'is not null' },
    ];
  }
  return [
    { id: 'eq', label: '=' },
    { id: 'ne', label: '≠' },
    { id: 'gt', label: '>' },
    { id: 'ge', label: '≥' },
    { id: 'lt', label: '<' },
    { id: 'le', label: '≤' },
    { id: 'in', label: 'in list' },
    { id: 'isNull', label: 'is null' },
    { id: 'isNotNull', label: 'is not null' },
  ];
}

function makeLiteral(opt: FlattenedPropertyOption, raw: string): LiteralValue {
  if (opt.isEnum && opt.enumType) {
    return { kind: 'enum', enumType: opt.enumType.fullName, member: raw };
  }
  if (opt.edmType === 'Edm.Boolean') {
    return { kind: 'boolean', value: raw.toLowerCase() === 'true' };
  }
  if (
    [
      'Edm.Byte',
      'Edm.SByte',
      'Edm.Int16',
      'Edm.Int32',
      'Edm.Int64',
      'Edm.Single',
      'Edm.Double',
      'Edm.Decimal',
    ].includes(opt.edmType)
  ) {
    const n = Number(raw);
    return { kind: 'number', value: Number.isNaN(n) ? 0 : n, edmType: opt.edmType };
  }
  if (opt.edmType === 'Edm.Guid') {
    return { kind: 'guid', value: raw };
  }
  if (
    opt.edmType === 'Edm.Date' ||
    opt.edmType === 'Edm.DateTime' ||
    opt.edmType === 'Edm.DateTimeOffset'
  ) {
    if (raw.startsWith('preset:')) {
      return {
        kind: 'relativeDate',
        preset: raw.slice(7) as RelativeDatePreset,
        edmType: opt.edmType,
      };
    }
    return { kind: 'date', value: raw, edmType: opt.edmType };
  }
  if (opt.edmType === 'Edm.Duration') {
    return { kind: 'duration', value: raw };
  }
  return { kind: 'string', value: raw };
}

function buildConditionNode(
  opt: FlattenedPropertyOption,
  op: OpChoice,
  rawVal: string,
  not: boolean,
  quantifier: 'any' | 'all' = 'any',
): FilterNode {
  const buildLeaf = (leafPath: string[]): FilterNode => {
    if (op === 'isNull') {
      return { kind: 'comparison', path: leafPath, op: 'eq', value: { kind: 'null' }, not };
    }
    if (op === 'isNotNull') {
      return { kind: 'comparison', path: leafPath, op: 'ne', value: { kind: 'null' }, not };
    }
    if (op === 'contains' || op === 'startswith' || op === 'endswith') {
      return { kind: 'stringFn', path: leafPath, fn: op, value: rawVal, not };
    }
    if (op === 'in') {
      const items = rawVal
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => makeLiteral(opt, s));
      return { kind: 'in', path: leafPath, values: items, not };
    }
    return { kind: 'comparison', path: leafPath, op, value: makeLiteral(opt, rawVal), not };
  };

  // Wrap in lambda when traversing a Collection property or 1-to-N navigation
  const colIdx = opt.collectionSegmentIndices[0];
  if (colIdx !== undefined) {
    const collectionPath = opt.path.slice(0, colIdx + 1);
    const rest = opt.path.slice(colIdx + 1);
    const alias = (collectionPath[collectionPath.length - 1]?.[0] ?? 'x').toLowerCase();
    const innerPath = rest.length > 0 ? [alias, ...rest] : [alias];
    return {
      kind: 'lambda',
      collectionPath,
      quantifier,
      alias,
      predicate: buildLeaf(innerPath),
      not: false,
    };
  }

  return buildLeaf(opt.path);
}

function extractNodeInfo(
  node: FilterNode,
  options: FlattenedPropertyOption[],
): {
  opt: FlattenedPropertyOption;
  op: OpChoice;
  rawVal: string;
  not: boolean;
  quantifier: 'any' | 'all';
} {
  let inner: FilterNode = node;
  let quantifier: 'any' | 'all' = 'any';
  let pathKey = '';

  if (node.kind === 'lambda') {
    quantifier = node.quantifier;
    const prefix = node.collectionPath.join('/');
    if (node.predicate && node.predicate.kind !== 'group' && node.predicate.kind !== 'lambda') {
      inner = node.predicate;
      const tail = inner.path.slice(1).join('/');
      pathKey = tail ? `${prefix}/${tail}` : prefix;
    } else {
      pathKey = prefix;
    }
  } else if (node.kind !== 'group') {
    pathKey = node.path.join('/');
  }

  const opt = options.find((o) => o.path.join('/') === pathKey) ??
    options[0] ?? {
      path: [''],
      label: '',
      edmType: 'Edm.String',
      isCollection: false,
      isEnum: false,
      collectionSegmentIndices: [],
    };

  if (inner.kind === 'stringFn') {
    return { opt, op: inner.fn, rawVal: inner.value, not: Boolean(inner.not), quantifier };
  }
  if (inner.kind === 'in') {
    const rawVal = inner.values
      .map((v) =>
        v.kind === 'enum'
          ? v.member
          : v.kind === 'null'
            ? 'null'
            : v.kind === 'relativeDate'
              ? `preset:${v.preset}`
              : String(v.value),
      )
      .join(', ');
    return { opt, op: 'in', rawVal, not: Boolean(inner.not), quantifier };
  }
  if (inner.kind === 'comparison') {
    if (inner.value.kind === 'null') {
      return {
        opt,
        op: inner.op === 'ne' ? 'isNotNull' : 'isNull',
        rawVal: '',
        not: Boolean(inner.not),
        quantifier,
      };
    }
    const rawVal =
      inner.value.kind === 'enum'
        ? inner.value.member
        : inner.value.kind === 'relativeDate'
          ? `preset:${inner.value.preset}`
          : String(inner.value.value);
    return { opt, op: inner.op, rawVal, not: Boolean(inner.not), quantifier };
  }

  return { opt, op: 'eq', rawVal: '', not: false, quantifier };
}

function renderFilterGroup(
  group: FilterGroupNode,
  options: FlattenedPropertyOption[],
  onStructuralChange: (next: FilterGroupNode) => void,
  onSilentChange: (next: FilterGroupNode) => void,
  onRemove?: () => void,
): HTMLElement {
  // Keep a mutable mirror so silent keystroke updates are preserved if the user immediately clicks + Condition / + Group
  let liveGroup: FilterGroupNode = { ...group, children: [...group.children] };

  const box = el('div', { class: 'oui-filter-group' });

  const andBtn = el('button', { type: 'button', class: group.op === 'and' ? 'active' : '' }, 'AND');
  const orBtn = el('button', { type: 'button', class: group.op === 'or' ? 'active' : '' }, 'OR');
  andBtn.addEventListener('click', () => onStructuralChange({ ...liveGroup, op: 'and' }));
  orBtn.addEventListener('click', () => onStructuralChange({ ...liveGroup, op: 'or' }));

  const notBtn = el(
    'button',
    { type: 'button', class: `oui-btn oui-btn-sm${group.not ? ' oui-btn-primary' : ''}` },
    'NOT',
  );
  notBtn.addEventListener('click', () => onStructuralChange({ ...liveGroup, not: !liveGroup.not }));

  const addCondBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '+ Condition');
  addCondBtn.addEventListener('click', () => {
    const firstOpt = options[0];
    if (!firstOpt) return;
    const defaultVal = firstOpt.isEnum
      ? (firstOpt.enumType?.members[0]?.name ?? '')
      : firstOpt.edmType === 'Edm.Boolean'
        ? 'true'
        : '';
    const child = buildConditionNode(firstOpt, 'eq', defaultVal, false);
    onStructuralChange({ ...liveGroup, children: [...liveGroup.children, child] });
  });

  const addGroupBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '+ Group');
  addGroupBtn.addEventListener('click', () => {
    const nested: FilterGroupNode = {
      kind: 'group',
      op: liveGroup.op === 'and' ? 'or' : 'and',
      children: [],
    };
    onStructuralChange({ ...liveGroup, children: [...liveGroup.children, nested] });
  });

  const headerRow = el(
    'div',
    { class: 'oui-filter-row' },
    el('div', { class: 'oui-seg' }, andBtn, orBtn),
    notBtn,
    addCondBtn,
    addGroupBtn,
  );
  if (onRemove) {
    const rmBtn = el(
      'button',
      { type: 'button', class: 'oui-btn oui-btn-sm', style: 'margin-left:auto;' },
      'Remove group',
    );
    rmBtn.addEventListener('click', onRemove);
    headerRow.appendChild(rmBtn);
  }
  box.appendChild(headerRow);

  liveGroup.children.forEach((child, idx) => {
    const updateChild = (nextChild: FilterNode) => {
      const next = [...liveGroup.children];
      next[idx] = nextChild;
      liveGroup = { ...liveGroup, children: next };
      onStructuralChange(liveGroup);
    };
    const updateChildSilent = (nextChild: FilterNode) => {
      const next = [...liveGroup.children];
      next[idx] = nextChild;
      liveGroup = { ...liveGroup, children: next };
      onSilentChange(liveGroup);
    };
    const removeChild = () => {
      onStructuralChange({
        ...liveGroup,
        children: liveGroup.children.filter((_, i) => i !== idx),
      });
    };

    if (child.kind === 'group') {
      box.appendChild(
        renderFilterGroup(child, options, updateChild, updateChildSilent, removeChild),
      );
      return;
    }

    const info = extractNodeInfo(child, options);
    let liveRawVal = info.rawVal;

    const propSelect = el('select', { class: 'oui-select', style: 'max-width:220px;' });
    for (const opt of options) {
      const key = opt.path.join('/');
      propSelect.appendChild(
        el('option', { value: key, selected: key === info.opt.path.join('/') }, opt.label),
      );
    }

    const ops = getOperatorsForOption(info.opt);
    const opSelect = el('select', { class: 'oui-select' });
    for (const o of ops) {
      opSelect.appendChild(el('option', { value: o.id, selected: o.id === info.op }, o.label));
    }

    let quantSelect: HTMLSelectElement | null = null;
    if (info.opt.collectionSegmentIndices.length > 0) {
      quantSelect = el(
        'select',
        { class: 'oui-select', title: 'Collection lambda quantifier' },
        el('option', { value: 'any', selected: info.quantifier === 'any' }, 'any'),
        el('option', { value: 'all', selected: info.quantifier === 'all' }, 'all'),
      );
    }

    let valueControl: HTMLElement | null = null;
    const needsValue = info.op !== 'isNull' && info.op !== 'isNotNull';

    if (needsValue) {
      if (info.opt.isEnum && info.opt.enumType && info.op !== 'in') {
        const sel = el('select', { class: 'oui-select' });
        for (const m of info.opt.enumType.members) {
          sel.appendChild(
            el('option', { value: m.name, selected: m.name === info.rawVal }, m.name),
          );
        }
        sel.addEventListener('change', () => {
          liveRawVal = sel.value;
          updateChild(buildConditionNode(info.opt, info.op, sel.value, info.not, info.quantifier));
        });
        valueControl = sel;
      } else if (info.opt.edmType === 'Edm.Boolean' && info.op !== 'in') {
        const sel = el(
          'select',
          { class: 'oui-select' },
          el('option', { value: 'true', selected: info.rawVal !== 'false' }, 'true'),
          el('option', { value: 'false', selected: info.rawVal === 'false' }, 'false'),
        );
        sel.addEventListener('change', () => {
          liveRawVal = sel.value;
          updateChild(buildConditionNode(info.opt, info.op, sel.value, info.not, info.quantifier));
        });
        valueControl = sel;
      } else if (
        (info.opt.edmType === 'Edm.Date' ||
          info.opt.edmType === 'Edm.DateTime' ||
          info.opt.edmType === 'Edm.DateTimeOffset') &&
        info.op !== 'in'
      ) {
        const presetSel = el(
          'select',
          { class: 'oui-select' },
          el('option', { value: '', selected: !info.rawVal.startsWith('preset:') }, 'Custom date'),
          el('option', { value: 'preset:now', selected: info.rawVal === 'preset:now' }, 'Now'),
          el(
            'option',
            { value: 'preset:today', selected: info.rawVal === 'preset:today' },
            'Today (UTC)',
          ),
          el(
            'option',
            { value: 'preset:7d-ago', selected: info.rawVal === 'preset:7d-ago' },
            '7 days ago',
          ),
          el(
            'option',
            { value: 'preset:30d-ago', selected: info.rawVal === 'preset:30d-ago' },
            '30 days ago',
          ),
          el(
            'option',
            { value: 'preset:7d-ahead', selected: info.rawVal === 'preset:7d-ahead' },
            'In 7 days',
          ),
        );
        const dateInput = el('input', {
          type: 'text',
          class: 'oui-input oui-input-mono',
          placeholder: '2026-01-01T00:00:00Z',
          value: info.rawVal.startsWith('preset:') ? '' : info.rawVal,
          style: info.rawVal.startsWith('preset:') ? 'display:none;' : 'width:185px;',
        });
        presetSel.addEventListener('change', () => {
          liveRawVal = presetSel.value || dateInput.value;
          updateChild(buildConditionNode(info.opt, info.op, liveRawVal, info.not, info.quantifier));
        });
        dateInput.addEventListener('input', () => {
          liveRawVal = dateInput.value;
          updateChildSilent(
            buildConditionNode(info.opt, info.op, dateInput.value, info.not, info.quantifier),
          );
        });
        valueControl = el('span', { style: 'display:inline-flex; gap:5px;' }, presetSel, dateInput);
      } else {
        const inp = el('input', {
          type: 'text',
          class: 'oui-input',
          placeholder: info.op === 'in' ? 'val1, val2, val3' : 'Value',
          value: info.rawVal,
          style: 'min-width:140px;',
        });
        inp.addEventListener('input', () => {
          liveRawVal = inp.value;
          updateChildSilent(
            buildConditionNode(info.opt, info.op, inp.value, info.not, info.quantifier),
          );
        });
        valueControl = inp;
      }
    }

    propSelect.addEventListener('change', () => {
      const nextOpt = options.find((o) => o.path.join('/') === propSelect.value) ?? info.opt;
      const defaultVal = nextOpt.isEnum
        ? (nextOpt.enumType?.members[0]?.name ?? '')
        : nextOpt.edmType === 'Edm.Boolean'
          ? 'true'
          : '';
      updateChild(buildConditionNode(nextOpt, 'eq', defaultVal, info.not, info.quantifier));
    });
    opSelect.addEventListener('change', () => {
      updateChild(
        buildConditionNode(
          info.opt,
          opSelect.value as OpChoice,
          liveRawVal,
          info.not,
          info.quantifier,
        ),
      );
    });
    quantSelect?.addEventListener('change', () => {
      updateChild(
        buildConditionNode(
          info.opt,
          info.op,
          liveRawVal,
          info.not,
          quantSelect.value === 'all' ? 'all' : 'any',
        ),
      );
    });

    const rowNotBtn = el(
      'button',
      {
        type: 'button',
        class: `oui-btn oui-btn-sm${info.not ? ' oui-btn-primary' : ''}`,
        title: 'Negate condition',
      },
      'NOT',
    );
    rowNotBtn.addEventListener('click', () => {
      updateChild(buildConditionNode(info.opt, info.op, liveRawVal, !info.not, info.quantifier));
    });

    const rmBtn = el(
      'button',
      { type: 'button', class: 'oui-btn oui-btn-sm', 'aria-label': 'Remove condition' },
      '×',
    );
    rmBtn.addEventListener('click', removeChild);

    box.appendChild(
      el(
        'div',
        { class: 'oui-filter-row' },
        rowNotBtn,
        propSelect,
        quantSelect,
        opSelect,
        valueControl,
        rmBtn,
      ),
    );
  });

  return box;
}

function renderExpandTree(
  model: ODataModel,
  entityType: EntityType,
  expands: ExpandNode[],
  onChange: (next: ExpandNode[]) => void,
  onSilentChange: (next: ExpandNode[]) => void,
  depth = 0,
): HTMLElement {
  const navs = getAllNavigationProperties(model, entityType);
  if (navs.length === 0) {
    return el('span', { class: 'oui-null' }, 'No navigation properties on this type.');
  }

  let liveExpands = [...expands];
  const wrap = el('div');
  const isV4 = model.version.startsWith('4');

  for (const nav of navs) {
    const existingIdx = liveExpands.findIndex((e) => e.property === nav.name);
    const existing = existingIdx >= 0 ? liveExpands[existingIdx] : undefined;
    const targetEntity = findEntityType(model, nav.type, entityType.namespace);

    const cb = el('input', { type: 'checkbox', checked: Boolean(existing) });
    cb.addEventListener('change', () => {
      if (cb.checked) {
        onChange([...liveExpands, { property: nav.name }]);
      } else {
        onChange(liveExpands.filter((e) => e.property !== nav.name));
      }
    });

    const item = el(
      'div',
      { class: 'oui-expand-item' },
      el(
        'label',
        {
          style:
            'display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;',
        },
        cb,
        nav.name,
        el('span', { class: 'oui-badge oui-badge-nav' }, nav.isCollection ? '*' : '1'),
      ),
    );

    if (existing && targetEntity && isV4) {
      const updateNode = (patch: Partial<ExpandNode>) => {
        const next = [...liveExpands];
        const current = next[existingIdx] ?? existing;
        next[existingIdx] = { ...current, ...patch };
        liveExpands = next;
        onChange(next);
      };
      const updateNodeSilent = (patch: Partial<ExpandNode>) => {
        const next = [...liveExpands];
        const current = next[existingIdx] ?? existing;
        next[existingIdx] = { ...current, ...patch };
        liveExpands = next;
        onSilentChange(next);
      };

      const nested = el('div', { class: 'oui-expand-nested' });

      // Nested $select chips
      const targetProps = getAllProperties(model, targetEntity);
      const selectedCols = new Set(existing.select ?? []);
      const chips = el('div', { class: 'oui-chip-list' });
      for (const p of targetProps) {
        const chip = el(
          'button',
          { type: 'button', class: `oui-chip${selectedCols.has(p.name) ? ' active' : ''}` },
          p.name,
        );
        chip.addEventListener('click', () => {
          const nextSel = new Set(selectedCols);
          if (nextSel.has(p.name)) nextSel.delete(p.name);
          else nextSel.add(p.name);
          updateNode({ select: [...nextSel] });
        });
        chips.appendChild(chip);
      }
      nested.appendChild(
        el(
          'div',
          {},
          el(
            'div',
            { style: 'font-size:11px; color:var(--odata-ui-text-muted); margin-bottom:4px;' },
            '$select (empty = all):',
          ),
          chips,
        ),
      );

      // Nested $top & $count
      const topInput = el('input', {
        type: 'number',
        class: 'oui-input',
        placeholder: '$top',
        style: 'width:78px;',
        value: existing.top !== undefined ? String(existing.top) : '',
      });
      topInput.addEventListener('input', () => {
        const val = topInput.value.trim();
        const parsed = val ? Number.parseInt(val, 10) : undefined;
        updateNodeSilent({ top: Number.isNaN(parsed) ? undefined : parsed });
      });

      const countCb = el('input', { type: 'checkbox', checked: Boolean(existing.count) });
      countCb.addEventListener('change', () => updateNode({ count: countCb.checked || undefined }));

      nested.appendChild(
        el(
          'div',
          { class: 'oui-qb-row' },
          el('label', { style: 'font-size:11.5px;' }, '$top: ', topInput),
          el(
            'label',
            { style: 'display:inline-flex; align-items:center; gap:4px; font-size:11.5px;' },
            countCb,
            '$count',
          ),
        ),
      );

      // Recursive child $expand (guard depth <= 2)
      if (depth < 2 && getAllNavigationProperties(model, targetEntity).length > 0) {
        const subDetails = el(
          'details',
          { open: Boolean(existing.expand && existing.expand.length > 0) },
          el(
            'summary',
            { style: 'cursor:pointer; font-size:11.5px; color:var(--odata-ui-accent);' },
            'Nested $expand',
          ),
          renderExpandTree(
            model,
            targetEntity,
            existing.expand ?? [],
            (sub) => updateNode({ expand: sub }),
            (sub) => updateNodeSilent({ expand: sub }),
            depth + 1,
          ),
        );
        nested.appendChild(subDetails);
      }

      item.appendChild(nested);
    }

    wrap.appendChild(item);
  }

  return wrap;
}

export function renderQueryBuilder(
  state: ExplorerState,
  store: ExplorerStore,
  callbacks: QueryBuilderCallbacks,
): HTMLElement {
  const wrap = el('div');
  if (!state.model || !state.queryAst) {
    wrap.appendChild(
      el('div', { class: 'oui-empty' }, 'Load an OData service to start building queries.'),
    );
    return wrap;
  }

  const model = state.model;
  const ast = state.queryAst;
  const container = getPrimaryContainer(model);
  const printed = printQuery(state.serviceRoot, ast, { version: model.version });

  // Build URL bar controls upfront so silent keystroke edits can sync the URL input directly
  const urlInput = el('input', {
    type: 'text',
    class: 'oui-input oui-input-mono',
    value: state.editableUrl,
    'aria-label': 'Generated OData query URL',
  });

  const syncBtn = el(
    'button',
    { type: 'button', class: 'oui-btn oui-btn-sm', hidden: !state.urlManuallyEdited },
    'Reset to Builder',
  );

  const updateAst = (updater: (cur: QueryAst) => QueryAst) => {
    const cur = store.getState().queryAst;
    if (cur) store.updateQueryAst(updater(cur));
  };

  const updateAstSilent = (updater: (cur: QueryAst) => QueryAst) => {
    const cur = store.getState().queryAst;
    if (!cur) return;
    const nextUrl = store.updateQueryAstSilent(updater(cur));
    urlInput.value = nextUrl;
    syncBtn.hidden = true;
  };

  // Resolve active entityType for entitySet / singleton targets
  let activeEntityType: EntityType | undefined;
  if (ast.targetKind === 'entitySet') {
    const es = findEntitySet(model, ast.targetName);
    if (es) activeEntityType = findEntityType(model, es.entityType);
  } else if (ast.targetKind === 'singleton') {
    const sing = findSingleton(model, ast.targetName);
    if (sing) activeEntityType = findEntityType(model, sing.type);
  }
  if (ast.derivedTypeCast) {
    activeEntityType = findEntityType(model, ast.derivedTypeCast) ?? activeEntityType;
  }

  // 1. Target & Key bar
  const targetSelect = el('select', { class: 'oui-select', 'aria-label': 'Query target' });
  const addOptGroup = (
    label: string,
    entries: Array<{ kind: QueryAst['targetKind']; name: string }>,
  ) => {
    if (entries.length === 0) return;
    const og = el('optgroup', { label });
    for (const entry of entries) {
      const value = `${entry.kind}:${entry.name}`;
      og.appendChild(
        el(
          'option',
          { value, selected: ast.targetKind === entry.kind && ast.targetName === entry.name },
          entry.name,
        ),
      );
    }
    targetSelect.appendChild(og);
  };

  addOptGroup(
    'Entity Sets',
    getAllEntitySets(model).map((es) => ({ kind: 'entitySet', name: es.name })),
  );
  addOptGroup(
    'Singletons',
    getAllSingletons(model).map((s) => ({ kind: 'singleton', name: s.name })),
  );
  addOptGroup(
    'Functions (GET)',
    (container?.functionImports ?? []).map((f) => ({ kind: 'functionImport', name: f.name })),
  );
  addOptGroup(
    'Actions (POST)',
    (container?.actionImports ?? []).map((a) => ({ kind: 'actionImport', name: a.name })),
  );

  targetSelect.addEventListener('change', () => {
    const [kind, ...rest] = targetSelect.value.split(':');
    const name = rest.join(':');
    if (kind && name) {
      store.updateQueryAst(createQueryAstForTarget(model, kind as QueryAst['targetKind'], name));
    }
  });

  const targetRow = el(
    'div',
    { class: 'oui-qb-row' },
    el('label', { class: 'oui-field-label' }, 'Target', targetSelect),
  );

  // Optional Key lookup inputs for EntitySet
  if (ast.targetKind === 'entitySet' && ast.keyValues && ast.keyValues.length > 0) {
    ast.keyValues.forEach((kv, idx) => {
      const kInp = el('input', {
        type: 'text',
        class: 'oui-input oui-input-mono',
        placeholder: `${kv.name} (${kv.edmType.replace('Edm.', '')})`,
        value: kv.value,
        style: 'width:155px;',
        'aria-label': `Key ${kv.name}`,
      });
      kInp.addEventListener('input', () => {
        const cur = store.getState().queryAst;
        if (!cur) return;
        const hadKey = Boolean(cur.keyValues?.some((k) => k.value.trim() !== ''));
        const nextKeys = [...(cur.keyValues ?? [])];
        nextKeys[idx] = { ...kv, value: kInp.value };
        const hasKey = nextKeys.some((k) => k.value.trim() !== '');
        if (hadKey !== hasKey) {
          store.updateQueryAst({ ...cur, keyValues: nextKeys });
        } else {
          updateAstSilent((c) => ({ ...c, keyValues: nextKeys }));
        }
      });
      targetRow.appendChild(el('label', { class: 'oui-field-label' }, `Key: ${kv.name}`, kInp));
    });
  }

  // Optional Derived Type cast
  if (ast.targetKind === 'entitySet') {
    const rootEs = findEntitySet(model, ast.targetName);
    const rootEt = rootEs ? findEntityType(model, rootEs.entityType) : undefined;
    const derived = rootEt ? getDerivedEntityTypes(model, rootEt) : [];
    if (derived.length > 0) {
      const castSel = el(
        'select',
        { class: 'oui-select' },
        el('option', { value: '', selected: !ast.derivedTypeCast }, '(Base type)'),
        ...derived.map((d) =>
          el('option', { value: d.fullName, selected: ast.derivedTypeCast === d.fullName }, d.name),
        ),
      );
      castSel.addEventListener('change', () => {
        updateAst((cur) => ({ ...cur, derivedTypeCast: castSel.value || undefined }));
      });
      targetRow.appendChild(el('label', { class: 'oui-field-label' }, 'Type Cast', castSel));
    }
  }

  // Optional Bound Operation quick-fill
  if (activeEntityType && (ast.targetKind === 'entitySet' || ast.targetKind === 'singleton')) {
    const bound = getBoundOperationsForType(model, activeEntityType);
    const hasKey =
      ast.targetKind === 'singleton' || Boolean(ast.keyValues?.some((k) => k.value.trim() !== ''));
    const applicable = hasKey ? bound.entityBound : bound.collectionBound;
    if (applicable.length > 0) {
      const bSel = el(
        'select',
        { class: 'oui-select' },
        el('option', { value: '', selected: !ast.boundOperation }, '(None)'),
        ...applicable.map((op) =>
          el(
            'option',
            { value: op.fullName, selected: ast.boundOperation?.fullName === op.fullName },
            `${op.kind === 'action' ? 'POST ' : 'GET '}${op.name}`,
          ),
        ),
      );
      bSel.addEventListener('change', () => {
        const picked = applicable.find((o) => o.fullName === bSel.value);
        if (!picked) {
          updateAst((cur) => ({ ...cur, boundOperation: undefined }));
        } else {
          updateAst((cur) => ({
            ...cur,
            boundOperation: {
              fullName: picked.fullName,
              kind: picked.kind,
              params: picked.parameters.slice(1).map((p) => ({
                name: p.name,
                edmType: p.type,
                isCollection: p.isCollection,
                value: '',
              })),
            },
          }));
        }
      });
      targetRow.appendChild(
        el(
          'label',
          { class: 'oui-field-label' },
          hasKey ? 'Bound Operation (Entity)' : 'Bound Operation (Collection)',
          bSel,
        ),
      );
    }
  }

  wrap.appendChild(el('div', { class: 'oui-qb-card' }, targetRow));

  // Unbound / Bound Operation parameter inputs
  const activeParams = ast.boundOperation?.params ?? ast.operationParams;
  if (activeParams && activeParams.length > 0) {
    const paramRow = el('div', { class: 'oui-qb-row' });
    activeParams.forEach((param, idx) => {
      const pInp = el('input', {
        type: 'text',
        class: 'oui-input oui-input-mono',
        placeholder: param.edmType,
        value: param.value,
      });
      pInp.addEventListener('input', () => {
        updateAstSilent((cur) => {
          if (cur.boundOperation) {
            const nextParams = [...cur.boundOperation.params];
            nextParams[idx] = { ...param, value: pInp.value };
            return {
              ...cur,
              boundOperation: { ...cur.boundOperation, params: nextParams },
            };
          }
          const nextParams = [...(cur.operationParams ?? [])];
          nextParams[idx] = { ...param, value: pInp.value };
          return { ...cur, operationParams: nextParams };
        });
      });
      paramRow.appendChild(
        el('label', { class: 'oui-field-label' }, `${param.name} (${param.edmType})`, pInp),
      );
    });
    wrap.appendChild(
      el(
        'div',
        { class: 'oui-qb-card' },
        el('div', { class: 'oui-section-title' }, 'Operation Parameters'),
        paramRow,
      ),
    );
  }

  // Action warning banner
  if (printed.method === 'POST') {
    wrap.appendChild(
      el(
        'div',
        { class: 'oui-banner oui-banner-warning' },
        el(
          'span',
          {},
          `"${ast.boundOperation?.fullName ?? ast.targetName}" is a POST Action that may modify or reset server data (such as ResetDataSource). Execution asks for confirmation before sending.`,
        ),
      ),
    );
  }

  // 2. Live Editable URL Bar
  const runActiveQuery = () => {
    const latestState = store.getState();
    const latestAst = latestState.queryAst ?? ast;
    const latestPrinted = printQuery(latestState.serviceRoot, latestAst, {
      version: model.version,
    });
    if (!latestState.serviceRoot && !latestState.editableUrl.startsWith('http')) {
      store.setState({
        queryError:
          'Cannot execute queries in offline metadata mode — enter a live service URL above.',
      });
      return;
    }
    if (latestPrinted.method === 'POST') {
      const ok = window.confirm(
        `Execute POST Action "${latestAst.boundOperation?.fullName ?? latestAst.targetName}"?\n\nThis may modify or wipe remote service data.`,
      );
      if (!ok) return;
    }
    const targetUrl = latestState.urlManuallyEdited
      ? latestState.editableUrl.trim()
      : latestPrinted.fetchUrl;
    callbacks.onRunQuery(targetUrl, latestPrinted.method, latestPrinted.body);
  };

  urlInput.addEventListener('input', () => {
    store.updateEditableUrlSilent(urlInput.value);
    syncBtn.hidden = false;
  });
  urlInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      runActiveQuery();
    }
  });

  const runBtn = el(
    'button',
    {
      type: 'button',
      class: `oui-btn ${printed.method === 'POST' ? 'oui-btn-danger' : 'oui-btn-primary'}`,
      disabled: state.queryLoading,
    },
    state.queryLoading
      ? 'Running…'
      : printed.method === 'POST'
        ? 'Execute POST Action'
        : 'Run Query',
  );
  runBtn.addEventListener('click', runActiveQuery);

  const copyBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Copy');
  copyBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(store.getState().editableUrl);
    copyBtn.textContent = ok ? 'Copied!' : 'Failed';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 1200);
  });

  syncBtn.addEventListener('click', () => {
    const latestState = store.getState();
    const latestAst = latestState.queryAst ?? ast;
    const latestPrinted = printQuery(latestState.serviceRoot, latestAst, {
      version: model.version,
    });
    store.setState({ editableUrl: latestPrinted.readableUrl, urlManuallyEdited: false });
  });

  wrap.appendChild(
    el(
      'div',
      { class: 'oui-url-bar' },
      el(
        'span',
        {
          class: `oui-badge ${printed.method === 'POST' ? 'oui-badge-warning' : 'oui-badge-accent'}`,
        },
        printed.method,
      ),
      urlInput,
      syncBtn,
      copyBtn,
      runBtn,
    ),
  );

  // 3. Query Options (collapsible so results sit immediately below the URL bar when desired)
  if (activeEntityType && printed.method === 'GET') {
    const toggleChevron = icon('chevron-down', 13);
    toggleChevron.classList.add('oui-qb-toggle-chevron');
    if (state.queryBuilderCollapsed) {
      toggleChevron.classList.add('collapsed');
    }

    const activeOptionBadges: string[] = [];
    if (ast.filter) activeOptionBadges.push('$filter');
    if (ast.select.length > 0) activeOptionBadges.push(`$select(${ast.select.length})`);
    if (ast.expand.length > 0) activeOptionBadges.push(`$expand(${ast.expand.length})`);
    if (ast.orderby.length > 0) activeOptionBadges.push(`$orderby(${ast.orderby.length})`);
    if (ast.search) activeOptionBadges.push('$search');
    if (ast.apply) activeOptionBadges.push('$apply');

    const toggleBuilderBtn = el(
      'button',
      {
        type: 'button',
        class: 'oui-btn oui-btn-sm oui-btn-ghost',
        'aria-expanded': state.queryBuilderCollapsed ? 'false' : 'true',
      },
      toggleChevron,
      state.queryBuilderCollapsed ? 'Show query options' : 'Hide query options',
      activeOptionBadges.length > 0 && state.queryBuilderCollapsed
        ? el('span', { class: 'oui-badge' }, activeOptionBadges.join(' · '))
        : null,
    );
    toggleBuilderBtn.addEventListener('click', () => {
      store.setState({ queryBuilderCollapsed: !state.queryBuilderCollapsed });
    });

    const jumpResultsBtn =
      state.queryResult && !state.queryBuilderCollapsed
        ? el(
            'button',
            { type: 'button', class: 'oui-btn oui-btn-sm oui-btn-ghost' },
            'Jump to results ↓',
          )
        : null;
    jumpResultsBtn?.addEventListener('click', () => {
      const rootNode = wrap.getRootNode() as ShadowRoot | Document;
      const resultsBar = rootNode.querySelector('.oui-results-bar') as HTMLElement | null;
      resultsBar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    wrap.appendChild(el('div', { class: 'oui-qb-toolbar' }, toggleBuilderBtn, jumpResultsBtn));

    if (!state.queryBuilderCollapsed) {
      const filterOptions = getFilterablePropertyPaths(model, activeEntityType);
      const allProps = getAllProperties(model, activeEntityType);

      // $filter section
      const rootGroup: FilterGroupNode =
        ast.filter?.kind === 'group'
          ? ast.filter
          : ast.filter
            ? { kind: 'group', op: 'and', children: [ast.filter] }
            : { kind: 'group', op: 'and', children: [] };

      wrap.appendChild(
        el(
          'div',
          { class: 'oui-qb-card' },
          el('div', { class: 'oui-section-title' }, '$filter'),
          renderFilterGroup(
            rootGroup,
            filterOptions,
            (nextGroup) => {
              updateAst((cur) => ({
                ...cur,
                filter: nextGroup.children.length > 0 ? nextGroup : undefined,
              }));
            },
            (nextGroup) => {
              updateAstSilent((cur) => ({
                ...cur,
                filter: nextGroup.children.length > 0 ? nextGroup : undefined,
              }));
            },
          ),
        ),
      );

      // $select & $expand side by side
      const selectChips = el('div', { class: 'oui-chip-list' });
      const selSet = new Set(ast.select);
      for (const p of allProps) {
        const chip = el(
          'button',
          { type: 'button', class: `oui-chip${selSet.has(p.name) ? ' active' : ''}` },
          p.name,
        );
        chip.addEventListener('click', () => {
          const next = new Set(selSet);
          if (next.has(p.name)) next.delete(p.name);
          else next.add(p.name);
          updateAst((cur) => ({ ...cur, select: [...next] }));
        });
        selectChips.appendChild(chip);
      }

      const selectCard = el(
        'div',
        { class: 'oui-qb-card' },
        el(
          'div',
          { class: 'oui-section-title' },
          `$select ${ast.select.length > 0 ? `(${ast.select.length})` : '(all)'}`,
        ),
        selectChips,
      );

      const expandCard = el(
        'div',
        { class: 'oui-qb-card' },
        el(
          'div',
          { class: 'oui-section-title' },
          `$expand ${ast.expand.length > 0 ? `(${ast.expand.length})` : ''}`,
        ),
        renderExpandTree(
          model,
          activeEntityType,
          ast.expand,
          (nextExpand) => {
            updateAst((cur) => ({ ...cur, expand: nextExpand }));
          },
          (nextExpand) => {
            updateAstSilent((cur) => ({ ...cur, expand: nextExpand }));
          },
        ),
      );

      wrap.appendChild(el('div', { class: 'oui-qb-grid' }, selectCard, expandCard));

      // $orderby, $top, $skip, $count, $search
      const orderList = el('div', { style: 'display:flex; flex-direction:column; gap:6px;' });
      ast.orderby.forEach((ob, idx) => {
        const pSel = el(
          'select',
          { class: 'oui-select' },
          ...allProps.map((p) =>
            el('option', { value: p.name, selected: p.name === ob.path }, p.name),
          ),
        );
        const dSel = el(
          'select',
          { class: 'oui-select' },
          el('option', { value: 'asc', selected: ob.direction === 'asc' }, 'asc'),
          el('option', { value: 'desc', selected: ob.direction === 'desc' }, 'desc'),
        );
        const rmBtn = el(
          'button',
          { type: 'button', class: 'oui-btn oui-btn-sm', 'aria-label': 'Remove order clause' },
          '×',
        );
        pSel.addEventListener('change', () => {
          updateAst((cur) => {
            const next = [...cur.orderby];
            next[idx] = { path: pSel.value, direction: dSel.value as 'asc' | 'desc' };
            return { ...cur, orderby: next };
          });
        });
        dSel.addEventListener('change', () => {
          updateAst((cur) => {
            const next = [...cur.orderby];
            next[idx] = { path: pSel.value, direction: dSel.value as 'asc' | 'desc' };
            return { ...cur, orderby: next };
          });
        });
        rmBtn.addEventListener('click', () => {
          updateAst((cur) => ({ ...cur, orderby: cur.orderby.filter((_, i) => i !== idx) }));
        });
        orderList.appendChild(el('div', { class: 'oui-qb-row' }, pSel, dSel, rmBtn));
      });

      const addOrderBtn = el(
        'button',
        { type: 'button', class: 'oui-btn oui-btn-sm' },
        '+ Order by',
      );
      addOrderBtn.addEventListener('click', () => {
        const firstProp = allProps[0]?.name;
        if (!firstProp) return;
        updateAst((cur) => ({
          ...cur,
          orderby: [...cur.orderby, { path: firstProp, direction: 'asc' }],
        }));
      });

      const topInput = el('input', {
        type: 'number',
        min: 0,
        class: 'oui-input',
        style: 'width:86px;',
        value: ast.top !== undefined ? String(ast.top) : '',
      });
      topInput.addEventListener('input', () => {
        const v = topInput.value.trim();
        const parsed = v === '' ? undefined : Number.parseInt(v, 10);
        updateAstSilent((cur) => ({ ...cur, top: Number.isNaN(parsed) ? undefined : parsed }));
      });

      const skipInput = el('input', {
        type: 'number',
        min: 0,
        class: 'oui-input',
        style: 'width:86px;',
        value: ast.skip !== undefined ? String(ast.skip) : '',
      });
      skipInput.addEventListener('input', () => {
        const v = skipInput.value.trim();
        const parsed = v === '' ? undefined : Number.parseInt(v, 10);
        updateAstSilent((cur) => ({ ...cur, skip: Number.isNaN(parsed) ? undefined : parsed }));
      });

      const searchInput = el('input', {
        type: 'text',
        class: 'oui-input',
        placeholder: 'Free-text $search',
        style: 'width:170px;',
        value: ast.search ?? '',
      });
      searchInput.addEventListener('input', () => {
        updateAstSilent((cur) => ({ ...cur, search: searchInput.value || undefined }));
      });

      const countCb = el('input', { type: 'checkbox', checked: Boolean(ast.count) });
      countCb.addEventListener('change', () => {
        updateAst((cur) => ({ ...cur, count: countCb.checked || undefined }));
      });

      wrap.appendChild(
        el(
          'div',
          { class: 'oui-qb-card' },
          el(
            'div',
            { class: 'oui-qb-row', style: 'justify-content:space-between;' },
            el(
              'div',
              { class: 'oui-qb-row' },
              el('label', { class: 'oui-field-label' }, '$top', topInput),
              el('label', { class: 'oui-field-label' }, '$skip', skipInput),
              el('label', { class: 'oui-field-label' }, '$search', searchInput),
              el(
                'label',
                {
                  style:
                    'display:inline-flex; align-items:center; gap:5px; margin-top:16px; cursor:pointer;',
                },
                countCb,
                '$count=true',
              ),
            ),
            el('div', {}, addOrderBtn),
          ),
          ast.orderby.length > 0 ? el('div', { style: 'margin-top:8px;' }, orderList) : null,
        ),
      );

      // Modest $apply (groupby + aggregate) in a clean collapsible block
      const apply = ast.apply ?? { groupBy: [], aggregates: [] };
      const applyActive = apply.groupBy.length > 0 || apply.aggregates.length > 0;
      const applyDetails = el(
        'details',
        { class: 'oui-qb-card', open: applyActive },
        el(
          'summary',
          {
            style:
              'cursor:pointer; font-weight:700; font-size:12px; text-transform:uppercase; color:var(--odata-ui-text-muted);',
          },
          `$apply (groupby / aggregate)${applyActive ? ' — Active' : ''}`,
        ),
      );

      const gbChips = el('div', { class: 'oui-chip-list', style: 'margin-top:8px;' });
      const gbSet = new Set(apply.groupBy);
      for (const p of allProps) {
        const chip = el(
          'button',
          { type: 'button', class: `oui-chip${gbSet.has(p.name) ? ' active' : ''}` },
          p.name,
        );
        chip.addEventListener('click', () => {
          const next = new Set(gbSet);
          if (next.has(p.name)) next.delete(p.name);
          else next.add(p.name);
          updateAst((cur) => {
            const curApply = cur.apply ?? { groupBy: [], aggregates: [] };
            const nextApply = { ...curApply, groupBy: [...next] };
            return {
              ...cur,
              apply:
                nextApply.groupBy.length > 0 || nextApply.aggregates.length > 0
                  ? nextApply
                  : undefined,
            };
          });
        });
        gbChips.appendChild(chip);
      }

      const aggList = el('div', {
        style: 'margin-top:8px; display:flex; flex-direction:column; gap:6px;',
      });
      const methods: AggregateMethod[] = [
        '$count',
        'sum',
        'min',
        'max',
        'average',
        'countdistinct',
      ];
      apply.aggregates.forEach((agg, idx) => {
        const mSel = el(
          'select',
          { class: 'oui-select' },
          ...methods.map((m) => el('option', { value: m, selected: m === agg.method }, m)),
        );
        const pSel = el(
          'select',
          { class: 'oui-select', style: agg.method === '$count' ? 'display:none;' : '' },
          ...allProps.map((p) =>
            el('option', { value: p.name, selected: p.name === agg.property }, p.name),
          ),
        );
        const aInp = el('input', {
          type: 'text',
          class: 'oui-input',
          placeholder: 'Alias',
          value: agg.alias,
          style: 'width:130px;',
        });
        const buildAggs = (cur: QueryAst) => {
          const curApply = cur.apply ?? { groupBy: [], aggregates: [] };
          const nextAggs = [...curApply.aggregates];
          nextAggs[idx] = {
            method: mSel.value as AggregateMethod,
            property: mSel.value === '$count' ? undefined : pSel.value,
            alias: aInp.value || 'Total',
          };
          return { ...cur, apply: { ...curApply, aggregates: nextAggs } };
        };
        mSel.addEventListener('change', () => updateAst(buildAggs));
        pSel.addEventListener('change', () => updateAst(buildAggs));
        aInp.addEventListener('input', () => updateAstSilent(buildAggs));
        const rmBtn = el(
          'button',
          { type: 'button', class: 'oui-btn oui-btn-sm', 'aria-label': 'Remove aggregate' },
          '×',
        );
        rmBtn.addEventListener('click', () => {
          updateAst((cur) => {
            const curApply = cur.apply ?? { groupBy: [], aggregates: [] };
            const nextAggs = curApply.aggregates.filter((_, i) => i !== idx);
            return {
              ...cur,
              apply:
                curApply.groupBy.length > 0 || nextAggs.length > 0
                  ? { ...curApply, aggregates: nextAggs }
                  : undefined,
            };
          });
        });
        aggList.appendChild(el('div', { class: 'oui-qb-row' }, mSel, pSel, 'as', aInp, rmBtn));
      });

      const addAggBtn = el(
        'button',
        { type: 'button', class: 'oui-btn oui-btn-sm', style: 'margin-top:8px;' },
        '+ Add Aggregate',
      );
      addAggBtn.addEventListener('click', () => {
        updateAst((cur) => {
          const curApply = cur.apply ?? { groupBy: [], aggregates: [] };
          return {
            ...cur,
            apply: {
              ...curApply,
              aggregates: [...curApply.aggregates, { method: '$count' as const, alias: 'Count' }],
            },
          };
        });
      });

      applyDetails.appendChild(
        el(
          'div',
          { style: 'margin-top:8px; font-size:11.5px; color:var(--odata-ui-text-muted);' },
          'Group by (filter automatically moves inside $apply):',
        ),
      );
      applyDetails.appendChild(gbChips);
      applyDetails.appendChild(aggList);
      applyDetails.appendChild(addAggBtn);
      wrap.appendChild(applyDetails);
    }
  }

  // Silence unused import warning check if getAllOperations is referenced later
  void getAllOperations;

  return wrap;
}
