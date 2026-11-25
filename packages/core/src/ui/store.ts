import { analyzeMetadata } from '../model/diagnostics.js';
import {
  findEntityType,
  getAllEntitySets,
  getAllEntityTypes,
  getAllOperations,
  getAllSingletons,
  getEffectiveKeys,
  getAllProperties,
  getPrimaryContainer,
} from '../model/helpers.js';
import type { MetadataDiagnostic, ODataModel } from '../model/types.js';
import { printQuery } from '../query/printer.js';
import type { KeyValue, QueryAst } from '../query/types.js';
import type { HeadersProvider, QueryExecutionResult, RequestInterceptor } from '../client/http.js';

export type SelectionKind =
  | 'entitySet'
  | 'singleton'
  | 'entityType'
  | 'complexType'
  | 'enumType'
  | 'operation';

export interface Selection {
  kind: SelectionKind;
  id: string; // entitySet/singleton name, or fullName for types/operations
}

export type ActiveTab = 'details' | 'diagram' | 'query' | 'advisor';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResultsViewMode = 'grid' | 'json' | 'split';

export interface CustomHeaderRow {
  key: string;
  value: string;
}

export interface ExplorerState {
  inputUrl: string;
  serviceRoot: string;
  model: ODataModel | null;
  diagnostics: MetadataDiagnostic[];
  loadingMetadata: boolean;
  metadataError: string | null;
  selected: Selection | null;
  activeTab: ActiveTab;
  treeFilter: string;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  headersDrawerOpen: boolean;
  sidebarOpenMobile: boolean;
  bearerToken: string;
  customHeaders: CustomHeaderRow[];

  // Diagram state
  diagramFocusType: string | null; // null = all entity types
  diagramHops: 1 | 2;
  diagramShowInheritance: boolean;
  diagramShowComplex: boolean;

  // Query state
  queryAst: QueryAst | null;
  editableUrl: string;
  urlManuallyEdited: boolean;
  queryLoading: boolean;
  queryError: string | null;
  queryResult: QueryExecutionResult | null;
  pageStack: string[];
  resultsViewMode: ResultsViewMode;

  // Programmatic hooks from ODataUIOptions
  headersProvider?: HeadersProvider;
  requestInterceptor?: RequestInterceptor;
}

type Listener = (state: ExplorerState) => void;

export function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function createDefaultQueryForModel(model: ODataModel): QueryAst | null {
  const firstSet = getAllEntitySets(model)[0];
  if (firstSet) {
    return createQueryAstForTarget(model, 'entitySet', firstSet.name);
  }
  const firstSingleton = getAllSingletons(model)[0];
  if (firstSingleton) {
    return createQueryAstForTarget(model, 'singleton', firstSingleton.name);
  }
  return null;
}

export function createQueryAstForTarget(
  model: ODataModel,
  targetKind: QueryAst['targetKind'],
  targetName: string,
): QueryAst {
  const container = getPrimaryContainer(model);
  let keyValues: KeyValue[] | undefined;

  if (targetKind === 'entitySet') {
    const es = getAllEntitySets(model).find((e) => e.name === targetName);
    const et = es ? findEntityType(model, es.entityType) : undefined;
    if (et) {
      const keys = getEffectiveKeys(model, et);
      const props = getAllProperties(model, et);
      keyValues = keys.map((k) => ({
        name: k,
        edmType: props.find((p) => p.name === k)?.type ?? 'Edm.String',
        value: '',
      }));
    }
  }

  let operationParams: QueryAst['operationParams'];
  if (targetKind === 'functionImport' || targetKind === 'actionImport') {
    const imp =
      targetKind === 'functionImport'
        ? container?.functionImports.find((f) => f.name === targetName)
        : container?.actionImports.find((a) => a.name === targetName);
    const opFullName =
      imp && 'function' in imp ? imp.function : imp && 'action' in imp ? imp.action : '';
    const op = getAllOperations(model).find(
      (o) => o.fullName === opFullName || o.name === targetName,
    );
    if (op) {
      operationParams = op.parameters.map((p) => ({
        name: p.name,
        edmType: p.type,
        isCollection: p.isCollection,
        value: '',
      }));
    }
  }

  return {
    targetKind,
    targetName,
    keyValues,
    operationParams,
    select: [],
    expand: [],
    orderby: [],
    top: targetKind === 'entitySet' ? 20 : undefined,
    count: targetKind === 'entitySet' ? true : undefined,
  };
}

export class ExplorerStore {
  private state: ExplorerState;
  private listeners = new Set<Listener>();

  constructor(initial: Partial<ExplorerState> = {}) {
    const theme = initial.theme ?? 'auto';
    this.state = {
      inputUrl: initial.inputUrl ?? '',
      serviceRoot: initial.serviceRoot ?? '',
      model: null,
      diagnostics: [],
      loadingMetadata: false,
      metadataError: null,
      selected: null,
      activeTab: 'details',
      treeFilter: '',
      theme,
      resolvedTheme: resolveEffectiveTheme(theme),
      headersDrawerOpen: false,
      sidebarOpenMobile: false,
      bearerToken: '',
      customHeaders: [],
      diagramFocusType: null,
      diagramHops: 1,
      diagramShowInheritance: true,
      diagramShowComplex: false,
      queryAst: null,
      editableUrl: '',
      urlManuallyEdited: false,
      queryLoading: false,
      queryError: null,
      queryResult: null,
      pageStack: [],
      resultsViewMode: 'grid',
      headersProvider: initial.headersProvider,
      requestInterceptor: initial.requestInterceptor,
    };
  }

  getState(): ExplorerState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setState(patch: Partial<ExplorerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setModel(model: ODataModel, serviceRoot: string, inputUrl?: string): void {
    const diagnostics = analyzeMetadata(model);
    const firstSet = getAllEntitySets(model)[0];
    const firstSingleton = getAllSingletons(model)[0];
    const firstType = getAllEntityTypes(model)[0];

    const selected: Selection | null = firstSet
      ? { kind: 'entitySet', id: firstSet.name }
      : firstSingleton
        ? { kind: 'singleton', id: firstSingleton.name }
        : firstType
          ? { kind: 'entityType', id: firstType.fullName }
          : null;

    const queryAst = createDefaultQueryForModel(model);
    const editableUrl = queryAst
      ? printQuery(serviceRoot, queryAst, { version: model.version }).readableUrl
      : serviceRoot;

    this.setState({
      model,
      diagnostics,
      serviceRoot,
      inputUrl: inputUrl ?? this.state.inputUrl,
      loadingMetadata: false,
      metadataError: null,
      selected,
      queryAst,
      editableUrl,
      urlManuallyEdited: false,
      queryResult: null,
      queryError: null,
      pageStack: [],
      diagramFocusType: null,
    });
  }

  updateQueryAst(ast: QueryAst): void {
    const model = this.state.model;
    const printed = printQuery(this.state.serviceRoot, ast, {
      version: model?.version ?? '4.0',
    });
    this.setState({
      queryAst: ast,
      editableUrl: printed.readableUrl,
      urlManuallyEdited: false,
    });
  }

  getEffectiveExtraHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.state.bearerToken.trim()) {
      const token = this.state.bearerToken.trim();
      headers.Authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    }
    for (const row of this.state.customHeaders) {
      if (row.key.trim()) {
        headers[row.key.trim()] = row.value;
      }
    }
    return headers;
  }
}
