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

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function resolveSelf(typeName: string, namespace: string): string {
  if (typeName.startsWith('self.')) {
    return `${namespace}.${typeName.slice(5)}`;
  }
  return typeName;
}

function extractInlineAnnotations(obj: JsonRecord): Annotation[] {
  const annotations: Annotation[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith('@')) continue;
    const rawTerm = key.slice(1);
    const hashIdx = rawTerm.indexOf('#');
    const term = hashIdx >= 0 ? rawTerm.slice(0, hashIdx) : rawTerm;
    const qualifier = hashIdx >= 0 ? rawTerm.slice(hashIdx + 1) : undefined;
    annotations.push({ term, qualifier, value });
  }
  return annotations;
}

function parseJsonProperty(name: string, def: JsonRecord, namespace: string): Property {
  const rawType = typeof def.$Type === 'string' ? def.$Type : 'Edm.String';
  return {
    name,
    type: resolveSelf(rawType, namespace),
    isCollection: Boolean(def.$Collection),
    nullable: def.$Nullable !== undefined ? Boolean(def.$Nullable) : true,
    maxLength: typeof def.$MaxLength === 'number' ? def.$MaxLength : undefined,
    precision: typeof def.$Precision === 'number' ? def.$Precision : undefined,
    scale: typeof def.$Scale === 'number' || def.$Scale === 'variable' ? def.$Scale : undefined,
    unicode: typeof def.$Unicode === 'boolean' ? def.$Unicode : undefined,
    defaultValue: def.$DefaultValue !== undefined ? String(def.$DefaultValue) : undefined,
    annotations: extractInlineAnnotations(def),
  };
}

function parseJsonNavProperty(
  name: string,
  def: JsonRecord,
  namespace: string,
): NavigationProperty {
  const rawType = typeof def.$Type === 'string' ? def.$Type : '';
  const isCollection = Boolean(def.$Collection);
  const referentialConstraints: ReferentialConstraint[] = [];
  if (isRecord(def.$ReferentialConstraint)) {
    for (const [property, referencedProperty] of Object.entries(def.$ReferentialConstraint)) {
      if (typeof referencedProperty === 'string') {
        referentialConstraints.push({ property, referencedProperty });
      }
    }
  }

  return {
    name,
    type: resolveSelf(rawType, namespace),
    isCollection,
    nullable: def.$Nullable !== undefined ? Boolean(def.$Nullable) : !isCollection,
    partner: typeof def.$Partner === 'string' ? def.$Partner : undefined,
    containsTarget: Boolean(def.$ContainsTarget),
    referentialConstraints,
    annotations: extractInlineAnnotations(def),
  };
}

function parseNavBindings(obj: unknown): NavigationPropertyBinding[] {
  if (!isRecord(obj)) return [];
  return Object.entries(obj)
    .filter(([, target]) => typeof target === 'string')
    .map(([path, target]) => ({ path, target: String(target) }));
}

function parseOperationArray(
  name: string,
  overloads: unknown[],
  namespace: string,
  kind: 'function' | 'action',
): Operation[] {
  const ops: Operation[] = [];
  for (const item of overloads) {
    if (!isRecord(item)) continue;
    const rawParams = Array.isArray(item.$Parameter) ? item.$Parameter : [];
    const parameters: OperationParameter[] = rawParams.filter(isRecord).map((p) => ({
      name: typeof p.$Name === 'string' ? p.$Name : '',
      type: resolveSelf(typeof p.$Type === 'string' ? p.$Type : 'Edm.String', namespace),
      isCollection: Boolean(p.$Collection),
      nullable: p.$Nullable !== undefined ? Boolean(p.$Nullable) : true,
      annotations: extractInlineAnnotations(p),
    }));

    const retObj = isRecord(item.$ReturnType) ? item.$ReturnType : undefined;
    const returnType = retObj
      ? {
          type: resolveSelf(
            typeof retObj.$Type === 'string' ? retObj.$Type : 'Edm.String',
            namespace,
          ),
          isCollection: Boolean(retObj.$Collection),
          nullable: retObj.$Nullable !== undefined ? Boolean(retObj.$Nullable) : true,
        }
      : undefined;

    ops.push({
      kind,
      name,
      namespace,
      fullName: `${namespace}.${name}`,
      isBound: Boolean(item.$IsBound),
      isComposable: Boolean(item.$IsComposable),
      entitySetPath: typeof item.$EntitySetPath === 'string' ? item.$EntitySetPath : undefined,
      parameters,
      returnType,
      annotations: extractInlineAnnotations(item),
    });
  }
  return ops;
}

export function parseJsonV4(raw: string): ODataModel {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON CSDL: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }

  if (!isRecord(root)) {
    throw new Error('Invalid JSON CSDL: root value must be a JSON object.');
  }

  const versionRaw = typeof root.$Version === 'string' ? root.$Version : '4.01';
  const version: ODataVersion = versionRaw === '4.0' ? '4.0' : '4.01';
  const warnings: string[] = [];

  if (isRecord(root.$Reference)) {
    for (const uri of Object.keys(root.$Reference)) {
      warnings.push(`Skipped external $Reference "${uri}" (not fetched in browser).`);
    }
  }

  const schemas: Schema[] = [];

  for (const [namespace, schemaVal] of Object.entries(root)) {
    if (namespace.startsWith('$') || !isRecord(schemaVal)) continue;

    const entityTypes: EntityType[] = [];
    const complexTypes: ComplexType[] = [];
    const enumTypes: EnumType[] = [];
    const functions: Operation[] = [];
    const actions: Operation[] = [];
    const containers: EntityContainer[] = [];
    const targetedAnnotations: TargetedAnnotations[] = [];

    if (isRecord(schemaVal.$Annotations)) {
      for (const [target, annVal] of Object.entries(schemaVal.$Annotations)) {
        if (!isRecord(annVal)) continue;
        targetedAnnotations.push({
          target: resolveSelf(target, namespace),
          annotations: extractInlineAnnotations(annVal),
        });
      }
    }

    for (const [memberName, memberVal] of Object.entries(schemaVal)) {
      if (memberName.startsWith('$') || memberName.startsWith('@')) continue;

      // Functions and Actions in JSON CSDL are arrays of overload objects
      if (Array.isArray(memberVal)) {
        const first = memberVal[0];
        if (isRecord(first) && first.$Kind === 'Function') {
          functions.push(...parseOperationArray(memberName, memberVal, namespace, 'function'));
        } else if (isRecord(first) && first.$Kind === 'Action') {
          actions.push(...parseOperationArray(memberName, memberVal, namespace, 'action'));
        }
        continue;
      }

      if (!isRecord(memberVal)) continue;
      const kind = memberVal.$Kind;

      if (kind === 'EntityType') {
        const keys: string[] = Array.isArray(memberVal.$Key)
          ? memberVal.$Key
              .map((k) =>
                typeof k === 'string' ? k : (Object.values(k as JsonRecord)[0] as string),
              )
              .filter(Boolean)
          : [];
        const properties: Property[] = [];
        const navigationProperties: NavigationProperty[] = [];

        for (const [pName, pVal] of Object.entries(memberVal)) {
          if (pName.startsWith('$') || pName.startsWith('@') || !isRecord(pVal)) continue;
          if (pVal.$Kind === 'NavigationProperty') {
            navigationProperties.push(parseJsonNavProperty(pName, pVal, namespace));
          } else {
            properties.push(parseJsonProperty(pName, pVal, namespace));
          }
        }

        entityTypes.push({
          name: memberName,
          namespace,
          fullName: `${namespace}.${memberName}`,
          baseType:
            typeof memberVal.$BaseType === 'string'
              ? resolveSelf(memberVal.$BaseType, namespace)
              : undefined,
          abstract: Boolean(memberVal.$Abstract),
          openType: Boolean(memberVal.$OpenType),
          hasStream: Boolean(memberVal.$HasStream),
          keys,
          properties,
          navigationProperties,
          annotations: extractInlineAnnotations(memberVal),
        });
      } else if (kind === 'ComplexType') {
        const properties: Property[] = [];
        const navigationProperties: NavigationProperty[] = [];

        for (const [pName, pVal] of Object.entries(memberVal)) {
          if (pName.startsWith('$') || pName.startsWith('@') || !isRecord(pVal)) continue;
          if (pVal.$Kind === 'NavigationProperty') {
            navigationProperties.push(parseJsonNavProperty(pName, pVal, namespace));
          } else {
            properties.push(parseJsonProperty(pName, pVal, namespace));
          }
        }

        complexTypes.push({
          name: memberName,
          namespace,
          fullName: `${namespace}.${memberName}`,
          baseType:
            typeof memberVal.$BaseType === 'string'
              ? resolveSelf(memberVal.$BaseType, namespace)
              : undefined,
          abstract: Boolean(memberVal.$Abstract),
          openType: Boolean(memberVal.$OpenType),
          properties,
          navigationProperties,
          annotations: extractInlineAnnotations(memberVal),
        });
      } else if (kind === 'EnumType') {
        const members: EnumMember[] = [];
        for (const [mName, mVal] of Object.entries(memberVal)) {
          if (mName.startsWith('$') || mName.startsWith('@')) continue;
          members.push({
            name: mName,
            value: mVal !== undefined ? String(mVal) : undefined,
            annotations: [],
          });
        }
        enumTypes.push({
          name: memberName,
          namespace,
          fullName: `${namespace}.${memberName}`,
          underlyingType:
            typeof memberVal.$UnderlyingType === 'string' ? memberVal.$UnderlyingType : 'Edm.Int32',
          isFlags: Boolean(memberVal.$IsFlags),
          members,
          annotations: extractInlineAnnotations(memberVal),
        });
      } else if (kind === 'EntityContainer') {
        const entitySets: EntitySet[] = [];
        const singletons: Singleton[] = [];
        const functionImports: FunctionImport[] = [];
        const actionImports: ActionImport[] = [];

        for (const [cMember, cVal] of Object.entries(memberVal)) {
          if (cMember.startsWith('$') || cMember.startsWith('@') || !isRecord(cVal)) continue;
          if (cVal.$Kind === 'Singleton') {
            singletons.push({
              name: cMember,
              type: resolveSelf(typeof cVal.$Type === 'string' ? cVal.$Type : '', namespace),
              navigationPropertyBindings: parseNavBindings(cVal.$NavigationPropertyBinding),
              annotations: extractInlineAnnotations(cVal),
            });
          } else if (cVal.$Kind === 'FunctionImport') {
            functionImports.push({
              name: cMember,
              function: resolveSelf(
                typeof cVal.$Function === 'string' ? cVal.$Function : '',
                namespace,
              ),
              entitySet: typeof cVal.$EntitySet === 'string' ? cVal.$EntitySet : undefined,
              includeInServiceDocument: Boolean(cVal.$IncludeInServiceDocument),
              annotations: extractInlineAnnotations(cVal),
            });
          } else if (cVal.$Kind === 'ActionImport') {
            actionImports.push({
              name: cMember,
              action: resolveSelf(typeof cVal.$Action === 'string' ? cVal.$Action : '', namespace),
              entitySet: typeof cVal.$EntitySet === 'string' ? cVal.$EntitySet : undefined,
              annotations: extractInlineAnnotations(cVal),
            });
          } else if (
            cVal.$Collection ||
            cVal.$Kind === 'EntitySet' ||
            typeof cVal.$Type === 'string'
          ) {
            entitySets.push({
              name: cMember,
              entityType: resolveSelf(typeof cVal.$Type === 'string' ? cVal.$Type : '', namespace),
              includeInServiceDocument:
                cVal.$IncludeInServiceDocument !== undefined
                  ? Boolean(cVal.$IncludeInServiceDocument)
                  : true,
              navigationPropertyBindings: parseNavBindings(cVal.$NavigationPropertyBinding),
              annotations: extractInlineAnnotations(cVal),
            });
          }
        }

        containers.push({
          name: memberName,
          namespace,
          fullName: `${namespace}.${memberName}`,
          entitySets,
          singletons,
          functionImports,
          actionImports,
          annotations: extractInlineAnnotations(memberVal),
        });
      }
    }

    schemas.push({
      namespace,
      alias: typeof schemaVal.$Alias === 'string' ? schemaVal.$Alias : undefined,
      entityTypes,
      complexTypes,
      enumTypes,
      functions,
      actions,
      containers,
      annotations: targetedAnnotations,
    });
  }

  return {
    version,
    sourceFormat: 'json-v4',
    schemas,
    warnings,
    raw,
  };
}
