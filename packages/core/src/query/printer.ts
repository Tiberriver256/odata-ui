import type { ODataVersion } from '../model/types.js';
import type {
  ApplySpec,
  ExpandNode,
  FilterNode,
  KeyValue,
  LiteralValue,
  OperationParamValue,
  PrintedQuery,
  QueryAst,
  RelativeDatePreset,
} from './types.js';

export interface PrintOptions {
  version?: ODataVersion;
  now?: Date;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function resolveRelativeDate(preset: RelativeDatePreset, now: Date, edmType?: string): string {
  const d = new Date(now.getTime());
  switch (preset) {
    case 'now':
      break;
    case 'today':
      d.setUTCHours(0, 0, 0, 0);
      break;
    case '7d-ago':
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case '30d-ago':
      d.setUTCDate(d.getUTCDate() - 30);
      break;
    case '7d-ahead':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case '30d-ahead':
      d.setUTCDate(d.getUTCDate() + 30);
      break;
  }
  const iso = d.toISOString();
  if (edmType === 'Edm.Date') {
    return iso.slice(0, 10);
  }
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

export function formatLiteral(
  lit: LiteralValue,
  version: ODataVersion = '4.0',
  now: Date = new Date(),
): string {
  const isV4 = version.startsWith('4');

  switch (lit.kind) {
    case 'null':
      return 'null';
    case 'boolean':
      return lit.value ? 'true' : 'false';
    case 'string':
      return `'${escapeODataString(lit.value)}'`;
    case 'number': {
      const s = String(lit.value);
      if (!isV4) {
        if (lit.edmType === 'Edm.Int64') return `${s}L`;
        if (lit.edmType === 'Edm.Decimal') return `${s}M`;
        if (lit.edmType === 'Edm.Single') return `${s}f`;
        if (lit.edmType === 'Edm.Double' && !s.includes('.')) return `${s}d`;
      }
      return s;
    }
    case 'enum':
      return `${lit.enumType}'${escapeODataString(lit.member)}'`;
    case 'guid':
      return isV4 ? lit.value : `guid'${lit.value}'`;
    case 'date': {
      if (isV4) return lit.value;
      if (lit.edmType === 'Edm.DateTimeOffset') return `datetimeoffset'${lit.value}'`;
      return `datetime'${lit.value.replace(/Z$/, '')}'`;
    }
    case 'relativeDate': {
      const resolved = resolveRelativeDate(lit.preset, now, lit.edmType);
      if (isV4) return resolved;
      if (lit.edmType === 'Edm.DateTimeOffset') return `datetimeoffset'${resolved}'`;
      return `datetime'${resolved.replace(/Z$/, '')}'`;
    }
    case 'duration':
      return isV4 ? `duration'${lit.value}'` : `time'${lit.value}'`;
    case 'raw':
      return lit.value;
  }
}

export function formatTypedValue(
  rawValue: string,
  edmType: string,
  version: ODataVersion = '4.0',
  isEnum = false,
): string {
  const trimmed = rawValue.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return 'null';
  if (isEnum) {
    if (trimmed.includes("'")) return trimmed;
    return `${edmType}'${escapeODataString(trimmed)}'`;
  }

  switch (edmType) {
    case 'Edm.Boolean':
      return trimmed.toLowerCase() === 'true' ? 'true' : 'false';
    case 'Edm.Byte':
    case 'Edm.SByte':
    case 'Edm.Int16':
    case 'Edm.Int32':
    case 'Edm.Int64':
    case 'Edm.Single':
    case 'Edm.Double':
    case 'Edm.Decimal': {
      const n = Number(trimmed);
      if (!Number.isNaN(n)) {
        return formatLiteral({ kind: 'number', value: n, edmType }, version);
      }
      return trimmed;
    }
    case 'Edm.Guid':
      return formatLiteral({ kind: 'guid', value: trimmed }, version);
    case 'Edm.Date':
    case 'Edm.DateTime':
    case 'Edm.DateTimeOffset':
      return formatLiteral({ kind: 'date', value: trimmed, edmType }, version);
    case 'Edm.Duration':
      return formatLiteral({ kind: 'duration', value: trimmed }, version);
    default:
      return formatLiteral({ kind: 'string', value: rawValue }, version);
  }
}

function parseJsonBodyValue(param: OperationParamValue): unknown {
  const trimmed = param.value.trim();
  if (param.isCollection) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (param.edmType === 'Edm.Boolean') return trimmed.toLowerCase() === 'true';
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
    ].includes(param.edmType)
  ) {
    const n = Number(trimmed);
    return Number.isNaN(n) ? trimmed : n;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return param.value;
    }
  }
  return param.value;
}

function wrapNot(expr: string, not?: boolean): string {
  if (!expr) return '';
  return not ? `not (${expr})` : expr;
}

export function printFilter(
  node: FilterNode | undefined,
  version: ODataVersion = '4.0',
  now: Date = new Date(),
  parentGroupOp?: 'and' | 'or',
): string {
  if (!node) return '';
  const isV4 = version.startsWith('4');

  switch (node.kind) {
    case 'group': {
      const rendered = node.children
        .map((child) => printFilter(child, version, now, node.op))
        .filter(Boolean);
      if (rendered.length === 0) return '';
      if (rendered.length === 1 && rendered[0]) {
        return wrapNot(rendered[0], node.not);
      }
      const joined = rendered.join(` ${node.op} `);
      if (node.not) {
        return `not (${joined})`;
      }
      // Parenthesize mixed boolean operators to preserve explicit precedence
      if (parentGroupOp && parentGroupOp !== node.op) {
        return `(${joined})`;
      }
      return joined;
    }

    case 'comparison': {
      const path = node.path.join('/');
      if (!path) return '';
      const lit = formatLiteral(node.value, version, now);
      return wrapNot(`${path} ${node.op} ${lit}`, node.not);
    }

    case 'stringFn': {
      const path = node.path.join('/');
      if (!path) return '';
      const lit = `'${escapeODataString(node.value)}'`;
      let expr: string;
      if (node.fn === 'contains' && !isV4) {
        expr = `substringof(${lit},${path})`;
      } else {
        expr = `${node.fn}(${path},${lit})`;
      }
      return wrapNot(expr, node.not);
    }

    case 'in': {
      const path = node.path.join('/');
      if (!path || node.values.length === 0) return '';
      if (isV4) {
        const list = node.values.map((v) => formatLiteral(v, version, now)).join(',');
        return wrapNot(`${path} in (${list})`, node.not);
      }
      // v2/v3 fallback: expand to parenthesized OR chain
      const ors = node.values
        .map((v) => `${path} eq ${formatLiteral(v, version, now)}`)
        .join(' or ');
      const expr = node.values.length > 1 ? `(${ors})` : ors;
      return wrapNot(expr, node.not);
    }

    case 'lambda': {
      const path = node.collectionPath.join('/');
      if (!path) return '';
      if (!node.predicate) {
        return wrapNot(`${path}/${node.quantifier}()`, node.not);
      }
      const inner = printFilter(node.predicate, version, now);
      if (!inner) {
        return wrapNot(`${path}/${node.quantifier}()`, node.not);
      }
      return wrapNot(`${path}/${node.quantifier}(${node.alias}:${inner})`, node.not);
    }
  }
}

export function printExpand(
  expands: ExpandNode[],
  version: ODataVersion = '4.0',
  now: Date = new Date(),
): string {
  if (expands.length === 0) return '';
  const isV4 = version.startsWith('4');

  if (!isV4) {
    // v2/v3 uses slash-separated paths without parenthesized nested options
    const flatten = (nodes: ExpandNode[], prefix = ''): string[] => {
      const paths: string[] = [];
      for (const n of nodes) {
        const current = prefix ? `${prefix}/${n.property}` : n.property;
        if (n.expand && n.expand.length > 0) {
          paths.push(...flatten(n.expand, current));
        } else {
          paths.push(current);
        }
      }
      return paths;
    };
    return flatten(expands).join(',');
  }

  return expands
    .map((node) => {
      const opts: string[] = [];
      if (node.select && node.select.length > 0) {
        opts.push(`$select=${node.select.join(',')}`);
      }
      if (node.filter) {
        const f = printFilter(node.filter, version, now);
        if (f) opts.push(`$filter=${f}`);
      }
      if (node.orderby && node.orderby.length > 0) {
        opts.push(
          `$orderby=${node.orderby.map((o) => (o.direction === 'desc' ? `${o.path} desc` : o.path)).join(',')}`,
        );
      }
      if (node.top !== undefined) opts.push(`$top=${node.top}`);
      if (node.skip !== undefined) opts.push(`$skip=${node.skip}`);
      if (node.count) opts.push('$count=true');
      if (node.levels !== undefined) opts.push(`$levels=${node.levels}`);
      if (node.expand && node.expand.length > 0) {
        const nested = printExpand(node.expand, version, now);
        if (nested) opts.push(`$expand=${nested}`);
      }
      return opts.length > 0 ? `${node.property}(${opts.join(';')})` : node.property;
    })
    .join(',');
}

export function printApply(apply: ApplySpec | undefined, filterExpr: string): string {
  if (!apply) return '';
  const hasGroup = apply.groupBy.length > 0;
  const hasAgg = apply.aggregates.length > 0;
  if (!hasGroup && !hasAgg) return '';

  const steps: string[] = [];
  if (filterExpr) {
    steps.push(`filter(${filterExpr})`);
  }

  const aggTerms = apply.aggregates
    .filter((a) => a.alias.trim() !== '')
    .map((a) => {
      if (a.method === '$count') {
        return `$count as ${a.alias.trim()}`;
      }
      const prop = a.property?.trim() || '';
      if (!prop) return '';
      return `${prop} with ${a.method} as ${a.alias.trim()}`;
    })
    .filter(Boolean);

  if (hasGroup) {
    const groupCols = apply.groupBy.join(',');
    if (aggTerms.length > 0) {
      steps.push(`groupby((${groupCols}),aggregate(${aggTerms.join(',')}))`);
    } else {
      steps.push(`groupby((${groupCols}))`);
    }
  } else if (aggTerms.length > 0) {
    steps.push(`aggregate(${aggTerms.join(',')})`);
  }

  return steps.join('/');
}

function formatKeySegment(keys: KeyValue[], version: ODataVersion): string {
  const filled = keys.filter((k) => k.value.trim() !== '');
  if (filled.length === 0) return '';
  if (filled.length === 1 && filled[0]) {
    return `(${formatTypedValue(filled[0].value, filled[0].edmType, version)})`;
  }
  return `(${filled.map((k) => `${k.name}=${formatTypedValue(k.value, k.edmType, version)}`).join(',')})`;
}

function formatFunctionParams(params: OperationParamValue[], version: ODataVersion): string {
  const filled = params.filter((p) => p.value.trim() !== '');
  if (filled.length === 0) return '()';
  return `(${filled
    .map((p) => `${p.name}=${formatTypedValue(p.value, p.edmType, version, p.isEnum)}`)
    .join(',')})`;
}

function encodeQueryValue(val: string): string {
  // Keep readable OData structural characters safe while encoding spaces, quotes, #, &, %, +
  return encodeURIComponent(val)
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%3B/g, ';')
    .replace(/%3A/g, ':')
    .replace(/%24/g, '$')
    .replace(/%3D/g, '=');
}

export function printQuery(
  serviceRoot: string,
  ast: QueryAst,
  options: PrintOptions = {},
): PrintedQuery {
  const version = options.version ?? '4.0';
  const now = options.now ?? new Date();
  const base = serviceRoot.replace(/\/+$/, '');

  let method: 'GET' | 'POST' = 'GET';
  let body: Record<string, unknown> | undefined;

  let path = ast.targetName;

  if (ast.targetKind === 'entitySet') {
    if (ast.keyValues && ast.keyValues.some((k) => k.value.trim() !== '')) {
      path += formatKeySegment(ast.keyValues, version);
    }
    if (ast.derivedTypeCast) {
      path += `/${ast.derivedTypeCast}`;
    }
    if (ast.boundOperation) {
      if (ast.boundOperation.kind === 'action') {
        method = 'POST';
        path += `/${ast.boundOperation.fullName}`;
        if (ast.boundOperation.params.length > 0) {
          body = {};
          for (const p of ast.boundOperation.params) {
            if (p.value.trim() !== '') body[p.name] = parseJsonBodyValue(p);
          }
        }
      } else {
        path += `/${ast.boundOperation.fullName}${formatFunctionParams(ast.boundOperation.params, version)}`;
      }
    }
  } else if (ast.targetKind === 'singleton') {
    if (ast.boundOperation) {
      if (ast.boundOperation.kind === 'action') {
        method = 'POST';
        path += `/${ast.boundOperation.fullName}`;
        if (ast.boundOperation.params.length > 0) {
          body = {};
          for (const p of ast.boundOperation.params) {
            if (p.value.trim() !== '') body[p.name] = parseJsonBodyValue(p);
          }
        }
      } else {
        path += `/${ast.boundOperation.fullName}${formatFunctionParams(ast.boundOperation.params, version)}`;
      }
    }
  } else if (ast.targetKind === 'functionImport') {
    if (version.startsWith('4')) {
      path += formatFunctionParams(ast.operationParams ?? [], version);
    }
  } else if (ast.targetKind === 'actionImport') {
    method = 'POST';
    const params = ast.operationParams ?? [];
    if (params.some((p) => p.value.trim() !== '')) {
      body = {};
      for (const p of params) {
        if (p.value.trim() !== '') body[p.name] = parseJsonBodyValue(p);
      }
    }
  }

  const queryParams: Array<[string, string]> = [];

  // v2/v3 FunctionImport parameters go in query string
  if (ast.targetKind === 'functionImport' && !version.startsWith('4')) {
    for (const p of ast.operationParams ?? []) {
      if (p.value.trim() !== '') {
        queryParams.push([p.name, formatTypedValue(p.value, p.edmType, version, p.isEnum)]);
      }
    }
  }

  const filterExpr = printFilter(ast.filter, version, now);
  const applyExpr = printApply(ast.apply, filterExpr);

  if (applyExpr) {
    queryParams.push(['$apply', applyExpr]);
  } else if (filterExpr) {
    queryParams.push(['$filter', filterExpr]);
  }

  if (ast.select.length > 0) {
    queryParams.push(['$select', ast.select.join(',')]);
  }

  const expandExpr = printExpand(ast.expand, version, now);
  if (expandExpr) {
    queryParams.push(['$expand', expandExpr]);
  }

  if (ast.orderby.length > 0) {
    queryParams.push([
      '$orderby',
      ast.orderby.map((o) => (o.direction === 'desc' ? `${o.path} desc` : o.path)).join(','),
    ]);
  }

  if (ast.top !== undefined && !Number.isNaN(ast.top)) {
    queryParams.push(['$top', String(ast.top)]);
  }
  if (ast.skip !== undefined && !Number.isNaN(ast.skip)) {
    queryParams.push(['$skip', String(ast.skip)]);
  }
  if (ast.count) {
    queryParams.push([
      version.startsWith('4') ? '$count' : '$inlinecount',
      version.startsWith('4') ? 'true' : 'allpages',
    ]);
  }
  if (ast.search && ast.search.trim() !== '') {
    queryParams.push(['$search', ast.search.trim()]);
  }

  const rootPrefix = base ? `${base}/${path}` : path;
  if (queryParams.length === 0) {
    return {
      readableUrl: rootPrefix,
      fetchUrl: encodeURI(rootPrefix),
      method,
      body,
    };
  }

  const readableQuery = queryParams.map(([k, v]) => `${k}=${v}`).join('&');
  const encodedQuery = queryParams.map(([k, v]) => `${k}=${encodeQueryValue(v)}`).join('&');

  return {
    readableUrl: `${rootPrefix}?${readableQuery}`,
    fetchUrl: `${encodeURI(rootPrefix)}?${encodedQuery}`,
    method,
    body,
  };
}
