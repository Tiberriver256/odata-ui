import { parseTypeRef, shortTypeName } from '../model/helpers.js';
import type {
  Annotation,
  ComplexType,
  EntityContainer,
  EntitySet,
  EntityType,
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

interface V23AssociationEnd {
  role: string;
  type: string;
  multiplicity: string;
}

interface V23Association {
  name: string;
  fullName: string;
  ends: V23AssociationEnd[];
  referentialConstraints: Array<{
    principalRole: string;
    dependentRole: string;
    constraints: ReferentialConstraint[];
  }>;
}

interface V23AssociationSet {
  name: string;
  association: string;
  ends: Array<{ role: string; entitySet: string }>;
}

function parseV3Annotations(parent: Element): Annotation[] {
  const out: Annotation[] = [];

  for (const va of childElements(parent, 'ValueAnnotation')) {
    const value =
      attr(va, 'String') ??
      (attr(va, 'Bool') !== undefined ? attr(va, 'Bool')?.toLowerCase() === 'true' : undefined) ??
      (attr(va, 'Int') !== undefined ? Number.parseInt(attr(va, 'Int') ?? '0', 10) : undefined) ??
      (attr(va, 'Decimal') !== undefined
        ? Number.parseFloat(attr(va, 'Decimal') ?? '0')
        : undefined) ??
      attr(va, 'Path') ??
      true;

    out.push({
      term: attr(va, 'Term') ?? '',
      qualifier: attr(va, 'Qualifier'),
      value,
    });
  }

  for (const ta of childElements(parent, 'TypeAnnotation')) {
    const record: Record<string, unknown> = {};
    for (const pv of childElements(ta, 'PropertyValue')) {
      const prop = attr(pv, 'Property');
      if (prop) {
        record[prop] = attr(pv, 'String') ?? attr(pv, 'Bool') ?? attr(pv, 'Int') ?? true;
      }
    }
    out.push({
      term: attr(ta, 'Term') ?? '',
      qualifier: attr(ta, 'Qualifier'),
      value: record,
    });
  }

  return out;
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
    annotations: parseV3Annotations(el),
  };
}

function parseAssociation(el: Element, namespace: string): V23Association {
  const name = attr(el, 'Name') ?? '';
  const ends: V23AssociationEnd[] = childElements(el, 'End').map((end) => ({
    role: attr(end, 'Role') ?? '',
    type: attr(end, 'Type') ?? '',
    multiplicity: attr(end, 'Multiplicity') ?? '0..1',
  }));

  const referentialConstraints: V23Association['referentialConstraints'] = [];
  for (const rc of childElements(el, 'ReferentialConstraint')) {
    const principal = firstChildElement(rc, 'Principal');
    const dependent = firstChildElement(rc, 'Dependent');
    if (!principal || !dependent) continue;
    const pRefs = childElements(principal, 'PropertyRef').map((r) => attr(r, 'Name') ?? '');
    const dRefs = childElements(dependent, 'PropertyRef').map((r) => attr(r, 'Name') ?? '');
    const constraints: ReferentialConstraint[] = [];
    for (let i = 0; i < Math.min(pRefs.length, dRefs.length); i++) {
      const p = pRefs[i];
      const d = dRefs[i];
      if (p && d) constraints.push({ property: d, referencedProperty: p });
    }
    referentialConstraints.push({
      principalRole: attr(principal, 'Role') ?? '',
      dependentRole: attr(dependent, 'Role') ?? '',
      constraints,
    });
  }

  return {
    name,
    fullName: `${namespace}.${name}`,
    ends,
    referentialConstraints,
  };
}

export function parseXmlV23(doc: Document, version: ODataVersion, raw: string): ODataModel {
  const root = doc.documentElement;
  const dataServices = firstChildElement(root, 'DataServices') ?? root;
  const schemaElements = childElements(dataServices, 'Schema');

  // Pass 1: collect all Associations and AssociationSets across schemas
  const associationsByFullName = new Map<string, V23Association>();
  const associationsByShortName = new Map<string, V23Association>();
  const associationSets: V23AssociationSet[] = [];

  for (const sEl of schemaElements) {
    const namespace = attr(sEl, 'Namespace') ?? '';
    for (const aEl of childElements(sEl, 'Association')) {
      const assoc = parseAssociation(aEl, namespace);
      associationsByFullName.set(assoc.fullName, assoc);
      associationsByShortName.set(assoc.name, assoc);
    }
    for (const cEl of childElements(sEl, 'EntityContainer')) {
      for (const asEl of childElements(cEl, 'AssociationSet')) {
        associationSets.push({
          name: attr(asEl, 'Name') ?? '',
          association: attr(asEl, 'Association') ?? '',
          ends: childElements(asEl, 'End').map((e) => ({
            role: attr(e, 'Role') ?? '',
            entitySet: attr(e, 'EntitySet') ?? '',
          })),
        });
      }
    }
  }

  const findAssociation = (relName: string): V23Association | undefined =>
    associationsByFullName.get(relName) ?? associationsByShortName.get(shortTypeName(relName));

  // Pass 2: build unified schemas translating NavigationProperty via Association ends
  const schemas: Schema[] = schemaElements.map((sEl) => {
    const namespace = attr(sEl, 'Namespace') ?? '';
    const extraFunctions: Operation[] = [];
    const extraActions: Operation[] = [];

    const entityTypes: EntityType[] = childElements(sEl, 'EntityType').map((etEl) => {
      const name = attr(etEl, 'Name') ?? '';
      const keyEl = firstChildElement(etEl, 'Key');
      const keys = keyEl
        ? childElements(keyEl, 'PropertyRef')
            .map((r) => attr(r, 'Name') ?? '')
            .filter(Boolean)
        : [];

      const navigationProperties: NavigationProperty[] = childElements(
        etEl,
        'NavigationProperty',
      ).map((npEl) => {
        const npName = attr(npEl, 'Name') ?? '';
        const relationship = attr(npEl, 'Relationship') ?? '';
        const toRole = attr(npEl, 'ToRole') ?? '';
        const assoc = findAssociation(relationship);
        const toEnd = assoc?.ends.find((e) => e.role === toRole);
        const isCollection = toEnd?.multiplicity === '*';
        const nullable = toEnd ? toEnd.multiplicity === '0..1' : true;
        const constraints = assoc?.referentialConstraints.flatMap((rc) => rc.constraints) ?? [];

        return {
          name: npName,
          type: toEnd?.type ?? '',
          isCollection,
          nullable,
          containsTarget: false,
          referentialConstraints: constraints,
          annotations: parseV3Annotations(npEl),
        };
      });

      return {
        name,
        namespace,
        fullName: `${namespace}.${name}`,
        baseType: attr(etEl, 'BaseType'),
        abstract: boolAttr(etEl, 'Abstract', false),
        openType: boolAttr(etEl, 'OpenType', false),
        hasStream: boolAttr(etEl, 'HasStream', false),
        keys,
        properties: childElements(etEl, 'Property').map(parseProperty),
        navigationProperties,
        annotations: parseV3Annotations(etEl),
      };
    });

    const complexTypes: ComplexType[] = childElements(sEl, 'ComplexType').map((ctEl) => {
      const name = attr(ctEl, 'Name') ?? '';
      return {
        name,
        namespace,
        fullName: `${namespace}.${name}`,
        baseType: attr(ctEl, 'BaseType'),
        abstract: boolAttr(ctEl, 'Abstract', false),
        openType: boolAttr(ctEl, 'OpenType', false),
        properties: childElements(ctEl, 'Property').map(parseProperty),
        navigationProperties: [],
        annotations: parseV3Annotations(ctEl),
      };
    });

    const containers: EntityContainer[] = childElements(sEl, 'EntityContainer').map((cEl) => {
      const cName = attr(cEl, 'Name') ?? 'Container';

      const entitySets: EntitySet[] = childElements(cEl, 'EntitySet').map((esEl) => {
        const esName = attr(esEl, 'Name') ?? '';
        const esType = attr(esEl, 'EntityType') ?? '';
        // Derive NavigationPropertyBindings from AssociationSets so v3 feels native
        const et = entityTypes.find(
          (e) => e.fullName === esType || e.name === shortTypeName(esType),
        );
        const navigationPropertyBindings: NavigationPropertyBinding[] = [];
        if (et) {
          for (const npEl of childElements(
            childElements(sEl, 'EntityType').find((el) => attr(el, 'Name') === et.name) ?? esEl,
            'NavigationProperty',
          )) {
            const npName = attr(npEl, 'Name') ?? '';
            const rel = attr(npEl, 'Relationship') ?? '';
            const toRole = attr(npEl, 'ToRole') ?? '';
            const matchingSet = associationSets.find(
              (a) =>
                (a.association === rel || shortTypeName(a.association) === shortTypeName(rel)) &&
                a.ends.some((end) => end.entitySet === esName),
            );
            const targetEnd = matchingSet?.ends.find((end) => end.role === toRole);
            if (npName && targetEnd?.entitySet) {
              navigationPropertyBindings.push({ path: npName, target: targetEnd.entitySet });
            }
          }
        }

        return {
          name: esName,
          entityType: esType,
          includeInServiceDocument: true,
          navigationPropertyBindings,
          annotations: parseV3Annotations(esEl),
        };
      });

      const functionImports: FunctionImport[] = [];
      for (const fiEl of childElements(cEl, 'FunctionImport')) {
        const fiName = attr(fiEl, 'Name') ?? '';
        const httpMethod = (attr(fiEl, 'HttpMethod') ?? 'GET').toUpperCase();
        const kind: 'function' | 'action' = httpMethod === 'POST' ? 'action' : 'function';
        const isBindable = boolAttr(fiEl, 'IsBindable', false);
        const retRaw = attr(fiEl, 'ReturnType');
        const parameters: OperationParameter[] = childElements(fiEl, 'Parameter').map((p) => {
          const parsed = parseTypeRef(attr(p, 'Type') ?? 'Edm.String');
          return {
            name: attr(p, 'Name') ?? '',
            type: parsed.type,
            isCollection: parsed.isCollection,
            nullable: boolAttr(p, 'Nullable', true),
            annotations: [],
          };
        });

        const op: Operation = {
          kind,
          name: fiName,
          namespace,
          fullName: `${namespace}.${fiName}`,
          isBound: isBindable,
          isComposable: boolAttr(fiEl, 'IsComposable', false),
          parameters,
          returnType: retRaw ? { ...parseTypeRef(retRaw), nullable: true } : undefined,
          annotations: parseV3Annotations(fiEl),
        };

        if (kind === 'function') {
          extraFunctions.push(op);
          functionImports.push({
            name: fiName,
            function: op.fullName,
            entitySet: attr(fiEl, 'EntitySet'),
            includeInServiceDocument: true,
            annotations: op.annotations,
          });
        } else {
          extraActions.push(op);
        }
      }

      return {
        name: cName,
        namespace,
        fullName: `${namespace}.${cName}`,
        entitySets,
        singletons: [],
        functionImports,
        actionImports: extraActions.map((a) => ({
          name: a.name,
          action: a.fullName,
          annotations: a.annotations,
        })),
        annotations: parseV3Annotations(cEl),
      };
    });

    const annotations: TargetedAnnotations[] = childElements(sEl, 'Annotations').map((aEl) => ({
      target: attr(aEl, 'Target') ?? '',
      qualifier: attr(aEl, 'Qualifier'),
      annotations: parseV3Annotations(aEl),
    }));

    return {
      namespace,
      alias: attr(sEl, 'Alias'),
      entityTypes,
      complexTypes,
      enumTypes: [],
      functions: extraFunctions,
      actions: extraActions,
      containers,
      annotations,
    };
  });

  return {
    version,
    sourceFormat: version === '2.0' ? 'xml-v2' : 'xml-v3',
    schemas,
    warnings: [],
    raw,
  };
}
