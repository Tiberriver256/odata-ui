import { parseTypeRef } from '../model/helpers.js';
import type {
  ActionImport,
  Annotation,
  ComplexType,
  EntityContainer,
  EntitySet,
  EntityType,
  EnumMember,
  EnumType,
  FunctionImport,
  NavigationProperty,
  NavigationPropertyBinding,
  ODataModel,
  ODataVersion,
  Operation,
  OperationParameter,
  Property,
  ReferentialConstraint,
  Schema,
  Singleton,
  TargetedAnnotations,
} from '../model/types.js';
import {
  attr,
  boolAttr,
  childElements,
  firstChildElement,
  intAttr,
  scaleAttr,
} from './xml-utils.js';

function parseAnnotationValue(el: Element): unknown {
  // Attribute-form expressions on <Annotation> or <PropertyValue>
  const str = attr(el, 'String');
  if (str !== undefined) return str;
  const boolVal = attr(el, 'Bool');
  if (boolVal !== undefined) return boolVal.toLowerCase() === 'true';
  const intVal = attr(el, 'Int');
  if (intVal !== undefined) return Number.parseInt(intVal, 10);
  const floatVal = attr(el, 'Float') ?? attr(el, 'Decimal');
  if (floatVal !== undefined) return Number.parseFloat(floatVal);
  const enumMember = attr(el, 'EnumMember');
  if (enumMember !== undefined) return enumMember;
  const pathVal =
    attr(el, 'PropertyPath') ??
    attr(el, 'NavigationPropertyPath') ??
    attr(el, 'AnnotationPath') ??
    attr(el, 'Path');
  if (pathVal !== undefined) return pathVal;

  const kids = childElements(el);
  if (kids.length === 0) return true;
  if (kids.length === 1 && kids[0]) {
    return parseExpressionElement(kids[0]);
  }
  return kids.map(parseExpressionElement);
}

function parseExpressionElement(el: Element): unknown {
  const tag = el.localName;
  const text = (el.textContent ?? '').trim();

  switch (tag) {
    case 'String':
    case 'PropertyPath':
    case 'NavigationPropertyPath':
    case 'AnnotationPath':
    case 'Path':
    case 'EnumMember':
    case 'Date':
    case 'DateTimeOffset':
    case 'Duration':
    case 'Guid':
    case 'TimeOfDay':
      return text;
    case 'Bool':
      return text.toLowerCase() === 'true';
    case 'Int':
      return Number.parseInt(text, 10);
    case 'Float':
    case 'Decimal':
      return Number.parseFloat(text);
    case 'Null':
      return null;
    case 'Collection':
      return childElements(el).map(parseExpressionElement);
    case 'Record': {
      const record: Record<string, unknown> = {};
      const recordType = attr(el, 'Type');
      if (recordType) record['@odata.type'] = recordType;
      for (const pv of childElements(el, 'PropertyValue')) {
        const propName = attr(pv, 'Property');
        if (propName) {
          record[propName] = parseAnnotationValue(pv);
        }
      }
      return record;
    }
    default:
      return text || true;
  }
}

export function parseV4Annotations(parent: Element): Annotation[] {
  return childElements(parent, 'Annotation').map((el) => ({
    term: attr(el, 'Term') ?? '',
    qualifier: attr(el, 'Qualifier'),
    value: parseAnnotationValue(el),
  }));
}

function parseProperty(el: Element): Property {
  const parsed = parseTypeRef(attr(el, 'Type') ?? 'Edm.String');
  return {
    name: attr(el, 'Name') ?? '',
    type: parsed.type,
    isCollection: parsed.isCollection,
    nullable: boolAttr(el, 'Nullable', true),
    maxLength: intAttr(el, 'MaxLength'),
    precision: intAttr(el, 'Precision'),
    scale: scaleAttr(el, 'Scale'),
    unicode: attr(el, 'Unicode') !== undefined ? boolAttr(el, 'Unicode', true) : undefined,
    defaultValue: attr(el, 'DefaultValue'),
    annotations: parseV4Annotations(el),
  };
}

function parseNavProperty(el: Element): NavigationProperty {
  const parsed = parseTypeRef(attr(el, 'Type') ?? '');
  const referentialConstraints: ReferentialConstraint[] = childElements(
    el,
    'ReferentialConstraint',
  ).map((rc) => ({
    property: attr(rc, 'Property') ?? '',
    referencedProperty: attr(rc, 'ReferencedProperty') ?? '',
  }));

  return {
    name: attr(el, 'Name') ?? '',
    type: parsed.type,
    isCollection: parsed.isCollection,
    nullable: boolAttr(el, 'Nullable', !parsed.isCollection),
    partner: attr(el, 'Partner'),
    containsTarget: boolAttr(el, 'ContainsTarget', false),
    referentialConstraints,
    annotations: parseV4Annotations(el),
  };
}

function parseEntityType(el: Element, namespace: string): EntityType {
  const name = attr(el, 'Name') ?? '';
  const keyEl = firstChildElement(el, 'Key');
  const keys = keyEl
    ? childElements(keyEl, 'PropertyRef')
        .map((ref) => attr(ref, 'Name') ?? '')
        .filter(Boolean)
    : [];

  return {
    name,
    namespace,
    fullName: `${namespace}.${name}`,
    baseType: attr(el, 'BaseType'),
    abstract: boolAttr(el, 'Abstract', false),
    openType: boolAttr(el, 'OpenType', false),
    hasStream: boolAttr(el, 'HasStream', false),
    keys,
    properties: childElements(el, 'Property').map(parseProperty),
    navigationProperties: childElements(el, 'NavigationProperty').map(parseNavProperty),
    annotations: parseV4Annotations(el),
  };
}

function parseComplexType(el: Element, namespace: string): ComplexType {
  const name = attr(el, 'Name') ?? '';
  return {
    name,
    namespace,
    fullName: `${namespace}.${name}`,
    baseType: attr(el, 'BaseType'),
    abstract: boolAttr(el, 'Abstract', false),
    openType: boolAttr(el, 'OpenType', false),
    properties: childElements(el, 'Property').map(parseProperty),
    navigationProperties: childElements(el, 'NavigationProperty').map(parseNavProperty),
    annotations: parseV4Annotations(el),
  };
}

function parseEnumType(el: Element, namespace: string): EnumType {
  const name = attr(el, 'Name') ?? '';
  const members: EnumMember[] = childElements(el, 'Member').map((m) => ({
    name: attr(m, 'Name') ?? '',
    value: attr(m, 'Value'),
    annotations: parseV4Annotations(m),
  }));

  return {
    name,
    namespace,
    fullName: `${namespace}.${name}`,
    underlyingType: attr(el, 'UnderlyingType') ?? 'Edm.Int32',
    isFlags: boolAttr(el, 'IsFlags', false),
    members,
    annotations: parseV4Annotations(el),
  };
}

function parseOperation(el: Element, namespace: string, kind: 'function' | 'action'): Operation {
  const name = attr(el, 'Name') ?? '';
  const parameters: OperationParameter[] = childElements(el, 'Parameter').map((p) => {
    const parsed = parseTypeRef(attr(p, 'Type') ?? 'Edm.String');
    return {
      name: attr(p, 'Name') ?? '',
      type: parsed.type,
      isCollection: parsed.isCollection,
      nullable: boolAttr(p, 'Nullable', true),
      annotations: parseV4Annotations(p),
    };
  });

  const retEl = firstChildElement(el, 'ReturnType');
  const returnType = retEl
    ? (() => {
        const parsed = parseTypeRef(attr(retEl, 'Type') ?? '');
        return {
          type: parsed.type,
          isCollection: parsed.isCollection,
          nullable: boolAttr(retEl, 'Nullable', true),
        };
      })()
    : undefined;

  return {
    kind,
    name,
    namespace,
    fullName: `${namespace}.${name}`,
    isBound: boolAttr(el, 'IsBound', false),
    isComposable: boolAttr(el, 'IsComposable', false),
    entitySetPath: attr(el, 'EntitySetPath'),
    parameters,
    returnType,
    annotations: parseV4Annotations(el),
  };
}

function parseNavBindings(el: Element): NavigationPropertyBinding[] {
  return childElements(el, 'NavigationPropertyBinding').map((b) => ({
    path: attr(b, 'Path') ?? '',
    target: attr(b, 'Target') ?? '',
  }));
}

function parseEntityContainer(el: Element, namespace: string): EntityContainer {
  const name = attr(el, 'Name') ?? 'Container';

  const entitySets: EntitySet[] = childElements(el, 'EntitySet').map((es) => ({
    name: attr(es, 'Name') ?? '',
    entityType: attr(es, 'EntityType') ?? '',
    includeInServiceDocument: boolAttr(es, 'IncludeInServiceDocument', true),
    navigationPropertyBindings: parseNavBindings(es),
    annotations: parseV4Annotations(es),
  }));

  const singletons: Singleton[] = childElements(el, 'Singleton').map((s) => ({
    name: attr(s, 'Name') ?? '',
    type: attr(s, 'Type') ?? '',
    navigationPropertyBindings: parseNavBindings(s),
    annotations: parseV4Annotations(s),
  }));

  const functionImports: FunctionImport[] = childElements(el, 'FunctionImport').map((fi) => ({
    name: attr(fi, 'Name') ?? '',
    function: attr(fi, 'Function') ?? '',
    entitySet: attr(fi, 'EntitySet'),
    includeInServiceDocument: boolAttr(fi, 'IncludeInServiceDocument', false),
    annotations: parseV4Annotations(fi),
  }));

  const actionImports: ActionImport[] = childElements(el, 'ActionImport').map((ai) => ({
    name: attr(ai, 'Name') ?? '',
    action: attr(ai, 'Action') ?? '',
    entitySet: attr(ai, 'EntitySet'),
    annotations: parseV4Annotations(ai),
  }));

  return {
    name,
    namespace,
    fullName: `${namespace}.${name}`,
    entitySets,
    singletons,
    functionImports,
    actionImports,
    annotations: parseV4Annotations(el),
  };
}

export function parseXmlV4(doc: Document, version: ODataVersion, raw: string): ODataModel {
  const root = doc.documentElement;
  const warnings: string[] = [];

  for (const ref of childElements(root, 'Reference')) {
    const uri = attr(ref, 'Uri') ?? 'unknown';
    warnings.push(
      `Skipped external <edmx:Reference Uri="${uri}"> include (not fetched in browser).`,
    );
  }

  const dataServices = firstChildElement(root, 'DataServices') ?? root;
  const schemas: Schema[] = childElements(dataServices, 'Schema').map((sEl) => {
    const namespace = attr(sEl, 'Namespace') ?? '';
    const annotations: TargetedAnnotations[] = childElements(sEl, 'Annotations').map((aEl) => ({
      target: attr(aEl, 'Target') ?? '',
      qualifier: attr(aEl, 'Qualifier'),
      annotations: parseV4Annotations(aEl),
    }));

    return {
      namespace,
      alias: attr(sEl, 'Alias'),
      entityTypes: childElements(sEl, 'EntityType').map((e) => parseEntityType(e, namespace)),
      complexTypes: childElements(sEl, 'ComplexType').map((c) => parseComplexType(c, namespace)),
      enumTypes: childElements(sEl, 'EnumType').map((en) => parseEnumType(en, namespace)),
      functions: childElements(sEl, 'Function').map((f) =>
        parseOperation(f, namespace, 'function'),
      ),
      actions: childElements(sEl, 'Action').map((a) => parseOperation(a, namespace, 'action')),
      containers: childElements(sEl, 'EntityContainer').map((c) =>
        parseEntityContainer(c, namespace),
      ),
      annotations,
    };
  });

  return {
    version,
    sourceFormat: 'xml-v4',
    schemas,
    warnings,
    raw,
  };
}
