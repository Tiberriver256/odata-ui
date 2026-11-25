export type ODataVersion = '2.0' | '3.0' | '4.0' | '4.01';

export type SourceFormat = 'xml-v4' | 'json-v4' | 'xml-v2' | 'xml-v3';

export interface Annotation {
  term: string;
  qualifier?: string;
  value: unknown;
}

export interface TargetedAnnotations {
  target: string;
  qualifier?: string;
  annotations: Annotation[];
}

export interface Property {
  name: string;
  type: string;
  isCollection: boolean;
  nullable: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number | 'variable';
  unicode?: boolean;
  defaultValue?: string;
  annotations: Annotation[];
}

export interface ReferentialConstraint {
  property: string;
  referencedProperty: string;
}

export interface NavigationProperty {
  name: string;
  type: string;
  isCollection: boolean;
  nullable: boolean;
  partner?: string;
  containsTarget: boolean;
  referentialConstraints: ReferentialConstraint[];
  annotations: Annotation[];
}

export interface EntityType {
  name: string;
  namespace: string;
  fullName: string;
  baseType?: string;
  abstract: boolean;
  openType: boolean;
  hasStream: boolean;
  keys: string[];
  properties: Property[];
  navigationProperties: NavigationProperty[];
  annotations: Annotation[];
}

export interface ComplexType {
  name: string;
  namespace: string;
  fullName: string;
  baseType?: string;
  abstract: boolean;
  openType: boolean;
  properties: Property[];
  navigationProperties: NavigationProperty[];
  annotations: Annotation[];
}

export interface EnumMember {
  name: string;
  value?: string;
  annotations: Annotation[];
}

export interface EnumType {
  name: string;
  namespace: string;
  fullName: string;
  underlyingType: string;
  isFlags: boolean;
  members: EnumMember[];
  annotations: Annotation[];
}

export interface OperationParameter {
  name: string;
  type: string;
  isCollection: boolean;
  nullable: boolean;
  annotations: Annotation[];
}

export interface OperationReturnType {
  type: string;
  isCollection: boolean;
  nullable: boolean;
}

export interface Operation {
  kind: 'function' | 'action';
  name: string;
  namespace: string;
  fullName: string;
  isBound: boolean;
  isComposable: boolean;
  entitySetPath?: string;
  parameters: OperationParameter[];
  returnType?: OperationReturnType;
  annotations: Annotation[];
}

export interface NavigationPropertyBinding {
  path: string;
  target: string;
}

export interface EntitySet {
  name: string;
  entityType: string;
  includeInServiceDocument: boolean;
  navigationPropertyBindings: NavigationPropertyBinding[];
  annotations: Annotation[];
}

export interface Singleton {
  name: string;
  type: string;
  navigationPropertyBindings: NavigationPropertyBinding[];
  annotations: Annotation[];
}

export interface FunctionImport {
  name: string;
  function: string;
  entitySet?: string;
  includeInServiceDocument: boolean;
  annotations: Annotation[];
}

export interface ActionImport {
  name: string;
  action: string;
  entitySet?: string;
  annotations: Annotation[];
}

export interface EntityContainer {
  name: string;
  namespace: string;
  fullName: string;
  entitySets: EntitySet[];
  singletons: Singleton[];
  functionImports: FunctionImport[];
  actionImports: ActionImport[];
  annotations: Annotation[];
}

export interface Schema {
  namespace: string;
  alias?: string;
  entityTypes: EntityType[];
  complexTypes: ComplexType[];
  enumTypes: EnumType[];
  functions: Operation[];
  actions: Operation[];
  containers: EntityContainer[];
  annotations: TargetedAnnotations[];
}

export interface ODataModel {
  version: ODataVersion;
  sourceFormat: SourceFormat;
  schemas: Schema[];
  warnings: string[];
  raw?: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'tip';
export type DiagnosticCategory = 'integrity' | 'capabilities' | 'discoverability' | 'modeling';

export interface MetadataDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  target?: string;
  targetKind?:
    | 'entitySet'
    | 'singleton'
    | 'entityType'
    | 'complexType'
    | 'enumType'
    | 'operation'
    | 'service';
  title: string;
  message: string;
  whyItMatters: string;
  exampleCsdl?: string;
}
