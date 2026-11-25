import type {
  Annotation,
  ComplexType,
  EntityContainer,
  EntitySet,
  EntityType,
  EnumType,
  NavigationProperty,
  ODataModel,
  Operation,
  Property,
  Singleton,
} from './types.js';

export interface ParsedTypeRef {
  type: string;
  isCollection: boolean;
}

export function parseTypeRef(raw: string): ParsedTypeRef {
  const trimmed = raw.trim();
  const match = /^Collection\((.+)\)$/.exec(trimmed);
  if (match && match[1]) {
    return { type: match[1].trim(), isCollection: true };
  }
  return { type: trimmed, isCollection: false };
}

export function shortTypeName(fullName: string): string {
  const idx = fullName.lastIndexOf('.');
  return idx >= 0 ? fullName.slice(idx + 1) : fullName;
}

export function isEdmType(typeName: string): boolean {
  return typeName.startsWith('Edm.');
}

export function resolveQualifiedName(
  model: ODataModel,
  rawName: string,
  defaultNamespace?: string,
): string {
  const trimmed = rawName.trim();
  if (!trimmed || isEdmType(trimmed)) return trimmed;

  if (trimmed.startsWith('self.') && defaultNamespace) {
    return `${defaultNamespace}.${trimmed.slice(5)}`;
  }

  // Check alias prefixes
  for (const schema of model.schemas) {
    if (schema.alias && trimmed.startsWith(`${schema.alias}.`)) {
      return `${schema.namespace}.${trimmed.slice(schema.alias.length + 1)}`;
    }
    if (trimmed.startsWith(`${schema.namespace}.`)) {
      return trimmed;
    }
  }

  // Unqualified name: try defaultNamespace first, then any schema
  if (!trimmed.includes('.') && defaultNamespace) {
    return `${defaultNamespace}.${trimmed}`;
  }

  return trimmed;
}

export function getAllContainers(model: ODataModel): EntityContainer[] {
  return model.schemas.flatMap((s) => s.containers);
}

export function getPrimaryContainer(model: ODataModel): EntityContainer | undefined {
  return getAllContainers(model)[0];
}

export function getAllEntitySets(model: ODataModel): EntitySet[] {
  return getAllContainers(model).flatMap((c) => c.entitySets);
}

export function getAllSingletons(model: ODataModel): Singleton[] {
  return getAllContainers(model).flatMap((c) => c.singletons);
}

export function getAllEntityTypes(model: ODataModel): EntityType[] {
  return model.schemas.flatMap((s) => s.entityTypes);
}

export function getAllComplexTypes(model: ODataModel): ComplexType[] {
  return model.schemas.flatMap((s) => s.complexTypes);
}

export function getAllEnumTypes(model: ODataModel): EnumType[] {
  return model.schemas.flatMap((s) => s.enumTypes);
}

export function getAllOperations(model: ODataModel): Operation[] {
  return model.schemas.flatMap((s) => [...s.functions, ...s.actions]);
}

export function findEntityType(
  model: ODataModel,
  typeName: string,
  defaultNamespace?: string,
): EntityType | undefined {
  const resolved = resolveQualifiedName(model, typeName, defaultNamespace);
  const short = shortTypeName(resolved);
  for (const et of getAllEntityTypes(model)) {
    if (et.fullName === resolved || et.name === typeName) return et;
  }
  return getAllEntityTypes(model).find((et) => et.name === short);
}

export function findComplexType(
  model: ODataModel,
  typeName: string,
  defaultNamespace?: string,
): ComplexType | undefined {
  const resolved = resolveQualifiedName(model, typeName, defaultNamespace);
  const short = shortTypeName(resolved);
  for (const ct of getAllComplexTypes(model)) {
    if (ct.fullName === resolved || ct.name === typeName) return ct;
  }
  return getAllComplexTypes(model).find((ct) => ct.name === short);
}

export function findEnumType(
  model: ODataModel,
  typeName: string,
  defaultNamespace?: string,
): EnumType | undefined {
  const resolved = resolveQualifiedName(model, typeName, defaultNamespace);
  const short = shortTypeName(resolved);
  for (const en of getAllEnumTypes(model)) {
    if (en.fullName === resolved || en.name === typeName) return en;
  }
  return getAllEnumTypes(model).find((en) => en.name === short);
}

export function findEntitySet(model: ODataModel, name: string): EntitySet | undefined {
  return getAllEntitySets(model).find((es) => es.name === name);
}

export function findSingleton(model: ODataModel, name: string): Singleton | undefined {
  return getAllSingletons(model).find((s) => s.name === name);
}

export function getBaseTypeChain(
  model: ODataModel,
  type: EntityType | ComplexType,
): Array<EntityType | ComplexType> {
  const chain: Array<EntityType | ComplexType> = [];
  const visited = new Set<string>([type.fullName]);
  let current: EntityType | ComplexType | undefined = type;

  while (current?.baseType) {
    const next: EntityType | ComplexType | undefined =
      findEntityType(model, current.baseType, current.namespace) ??
      findComplexType(model, current.baseType, current.namespace);
    if (!next || visited.has(next.fullName)) break;
    visited.add(next.fullName);
    chain.push(next);
    current = next;
  }

  return chain;
}

export interface InheritedProperty extends Property {
  declaredOn: string;
  inherited: boolean;
}

export function getAllProperties(
  model: ODataModel,
  type: EntityType | ComplexType,
): InheritedProperty[] {
  const chain = [...getBaseTypeChain(model, type).toReversed(), type];
  const byName = new Map<string, InheritedProperty>();

  for (const ancestor of chain) {
    for (const prop of ancestor.properties) {
      byName.set(prop.name, {
        ...prop,
        declaredOn: ancestor.fullName,
        inherited: ancestor.fullName !== type.fullName,
      });
    }
  }

  return [...byName.values()];
}

export interface InheritedNavigationProperty extends NavigationProperty {
  declaredOn: string;
  inherited: boolean;
}

export function getAllNavigationProperties(
  model: ODataModel,
  type: EntityType | ComplexType,
): InheritedNavigationProperty[] {
  const chain = [...getBaseTypeChain(model, type).toReversed(), type];
  const byName = new Map<string, InheritedNavigationProperty>();

  for (const ancestor of chain) {
    for (const nav of ancestor.navigationProperties) {
      byName.set(nav.name, {
        ...nav,
        declaredOn: ancestor.fullName,
        inherited: ancestor.fullName !== type.fullName,
      });
    }
  }

  return [...byName.values()];
}

export function getEffectiveKeys(model: ODataModel, entityType: EntityType): string[] {
  if (entityType.keys.length > 0) return entityType.keys;
  for (const ancestor of getBaseTypeChain(model, entityType)) {
    if ('keys' in ancestor && ancestor.keys.length > 0) {
      return ancestor.keys;
    }
  }
  return [];
}

export function getDerivedEntityTypes(model: ODataModel, entityType: EntityType): EntityType[] {
  const result: EntityType[] = [];
  const all = getAllEntityTypes(model);
  const queue = [entityType.fullName];
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const parent = queue.shift();
    for (const candidate of all) {
      if (!candidate.baseType || seen.has(candidate.fullName)) continue;
      const resolvedBase = resolveQualifiedName(model, candidate.baseType, candidate.namespace);
      if (resolvedBase === parent) {
        seen.add(candidate.fullName);
        result.push(candidate);
        queue.push(candidate.fullName);
      }
    }
  }

  return result;
}

export function getEntitySetForEntityType(
  model: ODataModel,
  entityType: EntityType,
): EntitySet | undefined {
  const sets = getAllEntitySets(model);
  const chain = [entityType, ...getBaseTypeChain(model, entityType)];
  for (const candidate of chain) {
    const found = sets.find((es) => {
      const resolved = resolveQualifiedName(model, es.entityType, candidate.namespace);
      return resolved === candidate.fullName;
    });
    if (found) return found;
  }
  return undefined;
}

export function getBoundOperationsForType(
  model: ODataModel,
  entityType: EntityType,
): { entityBound: Operation[]; collectionBound: Operation[] } {
  const chainNames = new Set([
    entityType.fullName,
    ...getBaseTypeChain(model, entityType).map((t) => t.fullName),
  ]);
  const entityBound: Operation[] = [];
  const collectionBound: Operation[] = [];

  for (const op of getAllOperations(model)) {
    if (!op.isBound || op.parameters.length === 0) continue;
    const bindingParam = op.parameters[0];
    if (!bindingParam) continue;
    const resolved = resolveQualifiedName(model, bindingParam.type, op.namespace);
    if (!chainNames.has(resolved)) continue;
    if (bindingParam.isCollection) {
      collectionBound.push(op);
    } else {
      entityBound.push(op);
    }
  }

  return { entityBound, collectionBound };
}

export function getAnnotationsForTarget(
  model: ODataModel,
  targetPath: string,
  inline: Annotation[] = [],
): Annotation[] {
  const results: Annotation[] = [...inline];
  const normalizedTargets = new Set<string>([targetPath]);

  // Also match alias-qualified target paths if applicable
  for (const schema of model.schemas) {
    if (schema.alias && targetPath.startsWith(`${schema.namespace}.`)) {
      normalizedTargets.add(`${schema.alias}.${targetPath.slice(schema.namespace.length + 1)}`);
    }
  }

  for (const schema of model.schemas) {
    for (const block of schema.annotations) {
      const resolvedBlockTarget = resolveAnnotationTarget(model, block.target, schema.namespace);
      if (normalizedTargets.has(block.target) || normalizedTargets.has(resolvedBlockTarget)) {
        results.push(...block.annotations);
      }
    }
  }

  return results;
}

function resolveAnnotationTarget(
  model: ODataModel,
  target: string,
  defaultNamespace: string,
): string {
  const slashIdx = target.indexOf('/');
  if (slashIdx === -1) {
    return resolveQualifiedName(model, target, defaultNamespace);
  }
  const head = resolveQualifiedName(model, target.slice(0, slashIdx), defaultNamespace);
  return `${head}${target.slice(slashIdx)}`;
}

export interface FlattenedPropertyOption {
  path: string[];
  label: string;
  edmType: string;
  isCollection: boolean;
  isEnum: boolean;
  enumType?: EnumType;
  /** True if any intermediate segment is a collection navigation or collection complex type */
  collectionSegmentIndices: number[];
}

export function getFilterablePropertyPaths(
  model: ODataModel,
  entityType: EntityType,
  maxComplexDepth = 3,
): FlattenedPropertyOption[] {
  const options: FlattenedPropertyOption[] = [];

  const visitType = (
    type: EntityType | ComplexType,
    prefix: string[],
    collectionIndices: number[],
    depth: number,
  ) => {
    for (const prop of getAllProperties(model, type)) {
      const nextPath = [...prefix, prop.name];
      const nextCol = prop.isCollection
        ? [...collectionIndices, nextPath.length - 1]
        : collectionIndices;

      const enumType = !isEdmType(prop.type)
        ? findEnumType(model, prop.type, type.namespace)
        : undefined;
      const complexType =
        !isEdmType(prop.type) && !enumType
          ? findComplexType(model, prop.type, type.namespace)
          : undefined;

      if (complexType && depth < maxComplexDepth) {
        visitType(complexType, nextPath, nextCol, depth + 1);
      } else {
        options.push({
          path: nextPath,
          label: nextPath.join('/'),
          edmType: prop.type,
          isCollection: prop.isCollection,
          isEnum: Boolean(enumType),
          enumType,
          collectionSegmentIndices: nextCol,
        });
      }
    }
  };

  visitType(entityType, [], [], 0);

  // Also include 1-hop navigation property scalar fields for expressive filtering
  for (const nav of getAllNavigationProperties(model, entityType)) {
    const target = findEntityType(model, nav.type, entityType.namespace);
    if (!target) continue;
    const navCol = nav.isCollection ? [0] : [];
    for (const prop of getAllProperties(model, target)) {
      if (prop.isCollection) continue;
      const enumType = !isEdmType(prop.type)
        ? findEnumType(model, prop.type, target.namespace)
        : undefined;
      if (!isEdmType(prop.type) && !enumType) continue;
      const path = [nav.name, prop.name];
      options.push({
        path,
        label: nav.isCollection ? `${nav.name} (any) / ${prop.name}` : `${nav.name}/${prop.name}`,
        edmType: prop.type,
        isCollection: false,
        isEnum: Boolean(enumType),
        enumType,
        collectionSegmentIndices: navCol,
      });
    }
  }

  return options;
}
