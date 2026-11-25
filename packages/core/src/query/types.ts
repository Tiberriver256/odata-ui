export type TargetKind = 'entitySet' | 'singleton' | 'functionImport' | 'actionImport';

export type ComparisonOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';
export type StringFn = 'contains' | 'startswith' | 'endswith';
export type RelativeDatePreset = 'now' | 'today' | '7d-ago' | '30d-ago' | '7d-ahead' | '30d-ahead';

export type LiteralValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number; edmType?: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'enum'; enumType: string; member: string }
  | { kind: 'guid'; value: string }
  | { kind: 'date'; value: string; edmType?: 'Edm.Date' | 'Edm.DateTime' | 'Edm.DateTimeOffset' }
  | {
      kind: 'relativeDate';
      preset: RelativeDatePreset;
      edmType?: 'Edm.Date' | 'Edm.DateTime' | 'Edm.DateTimeOffset';
    }
  | { kind: 'duration'; value: string }
  | { kind: 'raw'; value: string };

export interface FilterGroupNode {
  kind: 'group';
  op: 'and' | 'or';
  not?: boolean;
  children: FilterNode[];
}

export interface FilterComparisonNode {
  kind: 'comparison';
  path: string[];
  op: ComparisonOp;
  value: LiteralValue;
  not?: boolean;
}

export interface FilterStringFnNode {
  kind: 'stringFn';
  path: string[];
  fn: StringFn;
  value: string;
  not?: boolean;
}

export interface FilterInNode {
  kind: 'in';
  path: string[];
  values: LiteralValue[];
  not?: boolean;
}

export interface FilterLambdaNode {
  kind: 'lambda';
  collectionPath: string[];
  quantifier: 'any' | 'all';
  alias: string;
  predicate?: FilterNode;
  not?: boolean;
}

export type FilterNode =
  | FilterGroupNode
  | FilterComparisonNode
  | FilterStringFnNode
  | FilterInNode
  | FilterLambdaNode;

export interface OrderByClause {
  path: string;
  direction: 'asc' | 'desc';
}

export interface ExpandNode {
  property: string;
  select?: string[];
  expand?: ExpandNode[];
  filter?: FilterNode;
  orderby?: OrderByClause[];
  top?: number;
  skip?: number;
  count?: boolean;
  levels?: number | 'max';
}

export type AggregateMethod = 'sum' | 'min' | 'max' | 'average' | 'countdistinct' | '$count';

export interface AggregateClause {
  property?: string;
  method: AggregateMethod;
  alias: string;
}

export interface ApplySpec {
  groupBy: string[];
  aggregates: AggregateClause[];
}

export interface KeyValue {
  name: string;
  edmType: string;
  value: string;
}

export interface OperationParamValue {
  name: string;
  edmType: string;
  isCollection?: boolean;
  isEnum?: boolean;
  value: string;
}

export interface BoundOperationCall {
  fullName: string;
  kind: 'function' | 'action';
  params: OperationParamValue[];
}

export interface QueryAst {
  targetKind: TargetKind;
  targetName: string;
  keyValues?: KeyValue[];
  derivedTypeCast?: string;
  boundOperation?: BoundOperationCall;
  operationParams?: OperationParamValue[];
  filter?: FilterNode;
  select: string[];
  expand: ExpandNode[];
  orderby: OrderByClause[];
  top?: number;
  skip?: number;
  count?: boolean;
  search?: string;
  apply?: ApplySpec;
}

export interface PrintedQuery {
  readableUrl: string;
  fetchUrl: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}
