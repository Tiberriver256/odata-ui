import {
  findComplexType,
  findEntityType,
  findEnumType,
  getAllContainers,
  getAllEntitySets,
  getAllEntityTypes,
  getAllNavigationProperties,
  getAllOperations,
  getAllProperties,
  getAnnotationsForTarget,
  getEffectiveKeys,
  isEdmType,
  resolveQualifiedName,
} from './helpers.js';
import type { Annotation, MetadataDiagnostic, ODataModel } from './types.js';

function hasTerm(annotations: Annotation[], pattern: string): boolean {
  const lower = pattern.toLowerCase();
  return annotations.some((a) => a.term.toLowerCase().includes(lower));
}

function hasAnyCapabilities(annotations: Annotation[]): boolean {
  return annotations.some((a) => a.term.toLowerCase().includes('capabilities.v1.'));
}

function hasDescription(annotations: Annotation[]): boolean {
  return (
    hasTerm(annotations, 'core.v1.description') || hasTerm(annotations, 'core.v1.longdescription')
  );
}

/**
 * Analyzes a parsed ODataModel and returns actionable, educational diagnostics
 * designed to help API authors improve their OData $metadata quality.
 */
export function analyzeMetadata(model: ODataModel): MetadataDiagnostic[] {
  const diagnostics: MetadataDiagnostic[] = [];

  // 1. Parser warnings (e.g. external edmx:Reference vocabularies)
  for (const warning of model.warnings) {
    diagnostics.push({
      id: 'parser-warning',
      severity: 'warning',
      category: 'integrity',
      targetKind: 'service',
      title: 'Metadata reference notice',
      message: warning,
      whyItMatters:
        'External vocabulary references are not fetched automatically by browser clients. Inline critical annotations or ensure referenced vocabularies are standard OASIS vocabularies.',
    });
  }

  // 2. Legacy OData v2/v3 notice
  if (model.version === '2.0' || model.version === '3.0') {
    diagnostics.push({
      id: 'legacy-odata-version',
      severity: 'tip',
      category: 'modeling',
      targetKind: 'service',
      title: `OData v${model.version} CSDL detected`,
      message: `This service publishes OData v${model.version} metadata using legacy Association / AssociationSet elements.`,
      whyItMatters:
        'OData v4 replaces Associations with direct typed NavigationProperties, adds native EnumType, Singletons, Containment (ContainsTarget), nested $expand(...) options, and standardized OASIS Vocabulary Annotations.',
    });
  }

  const containers = getAllContainers(model);
  if (containers.length === 0) {
    diagnostics.push({
      id: 'missing-container',
      severity: 'error',
      category: 'integrity',
      targetKind: 'service',
      title: 'No EntityContainer declared',
      message:
        'The metadata document defines no <EntityContainer>, so clients cannot discover queryable EntitySets or Singletons.',
      whyItMatters:
        'An EntityContainer is the entry point of an OData service; without it, tools cannot construct service root URLs.',
    });
  }

  const allEntityTypes = getAllEntityTypes(model);
  const entitySets = getAllEntitySets(model);

  // 3. EntityType checks: keys, unresolved types, precision/scale, Partner navs
  let entityTypesMissingDesc = 0;

  for (const et of allEntityTypes) {
    const etAnnotations = getAnnotationsForTarget(model, et.fullName, et.annotations);
    if (!hasDescription(etAnnotations)) {
      entityTypesMissingDesc += 1;
    }

    // Unresolved BaseType
    if (et.baseType && !findEntityType(model, et.baseType, et.namespace)) {
      diagnostics.push({
        id: `unresolved-basetype:${et.fullName}`,
        severity: 'error',
        category: 'integrity',
        target: et.fullName,
        targetKind: 'entityType',
        title: `Unresolved BaseType on ${et.name}`,
        message: `${et.name} declares BaseType="${et.baseType}", which was not found in any loaded schema.`,
        whyItMatters:
          'Clients walk BaseType to inherit keys and properties. A missing base type breaks key lookup and query generation.',
      });
    }

    // Missing Key on concrete entity type
    const effectiveKeys = getEffectiveKeys(model, et);
    if (!et.abstract && effectiveKeys.length === 0) {
      diagnostics.push({
        id: `missing-key:${et.fullName}`,
        severity: 'error',
        category: 'integrity',
        target: et.fullName,
        targetKind: 'entityType',
        title: `EntityType ${et.name} has no Key`,
        message: `Concrete EntityType "${et.name}" does not declare a <Key> (nor inherit one from a BaseType).`,
        whyItMatters:
          'Every OData EntityType requires a key so individual entities can be addressed via EntitySet(key), cached, and updated.',
        exampleCsdl: `<EntityType Name="${et.name}">\n  <Key>\n    <PropertyRef Name="Id" />\n  </Key>\n  <Property Name="Id" Type="Edm.Int32" Nullable="false" />\n</EntityType>`,
      });
    }

    // Key property marked Nullable="true"
    const allProps = getAllProperties(model, et);
    for (const keyName of effectiveKeys) {
      const keyProp = allProps.find((p) => p.name === keyName);
      if (!keyProp) {
        diagnostics.push({
          id: `missing-key-prop:${et.fullName}:${keyName}`,
          severity: 'error',
          category: 'integrity',
          target: et.fullName,
          targetKind: 'entityType',
          title: `Key property "${keyName}" not found on ${et.name}`,
          message: `<Key> references "${keyName}", which is not declared on ${et.name} or its ancestors.`,
          whyItMatters:
            'Key references must match an existing structural property so URLs like EntitySet(key) can be typed properly.',
        });
      } else if (keyProp.nullable) {
        diagnostics.push({
          id: `nullable-key:${et.fullName}:${keyName}`,
          severity: 'warning',
          category: 'integrity',
          target: et.fullName,
          targetKind: 'entityType',
          title: `Key property "${keyName}" on ${et.name} is nullable`,
          message: `Key property "${keyName}" does not specify Nullable="false".`,
          whyItMatters:
            'In OData CSDL, properties default to Nullable="true" unless explicitly marked Nullable="false". Primary keys should always be non-nullable.',
          exampleCsdl: `<Property Name="${keyName}" Type="${keyProp.type}" Nullable="false" />`,
        });
      }
    }

    // Decimal precision/scale & unresolved property types
    for (const prop of et.properties) {
      if (
        !isEdmType(prop.type) &&
        !findComplexType(model, prop.type, et.namespace) &&
        !findEnumType(model, prop.type, et.namespace)
      ) {
        diagnostics.push({
          id: `unresolved-prop-type:${et.fullName}:${prop.name}`,
          severity: 'warning',
          category: 'integrity',
          target: et.fullName,
          targetKind: 'entityType',
          title: `Unresolved property type on ${et.name}.${prop.name}`,
          message: `Property "${prop.name}" references type "${prop.type}", which is not an Edm primitive, ComplexType, or EnumType in this document.`,
          whyItMatters:
            'If a type comes from an external schema or typo, clients fall back to untyped strings and cannot build typed filters.',
        });
      }

      if (
        prop.type === 'Edm.Decimal' &&
        (prop.precision === undefined || prop.scale === undefined)
      ) {
        diagnostics.push({
          id: `decimal-precision:${et.fullName}:${prop.name}`,
          severity: 'tip',
          category: 'modeling',
          target: et.fullName,
          targetKind: 'entityType',
          title: `Edm.Decimal without Precision/Scale on ${et.name}.${prop.name}`,
          message: `Property "${prop.name}" uses Edm.Decimal without explicit Precision and Scale facets.`,
          whyItMatters:
            'Declaring Precision and Scale prevents rounding mismatches in code generators, Power BI, and financial clients.',
          exampleCsdl: `<Property Name="${prop.name}" Type="Edm.Decimal" Precision="18" Scale="2" Nullable="${prop.nullable}" />`,
        });
      }
    }

    // NavigationProperty checks: unresolved target & missing Partner
    for (const nav of et.navigationProperties) {
      const targetEntity = findEntityType(model, nav.type, et.namespace);
      if (!targetEntity) {
        diagnostics.push({
          id: `unresolved-nav:${et.fullName}:${nav.name}`,
          severity: 'error',
          category: 'integrity',
          target: et.fullName,
          targetKind: 'entityType',
          title: `Unresolved NavigationProperty target on ${et.name}.${nav.name}`,
          message: `NavigationProperty "${nav.name}" points to "${nav.type}", which is not defined in the metadata.`,
          whyItMatters:
            'Clients cannot build nested $expand options or relationship graphs for unresolved targets.',
        });
        continue;
      }

      if (model.version.startsWith('4') && !nav.partner && !nav.containsTarget) {
        const inverse = getAllNavigationProperties(model, targetEntity).find(
          (rev) => resolveQualifiedName(model, rev.type, targetEntity.namespace) === et.fullName,
        );
        if (inverse) {
          diagnostics.push({
            id: `missing-partner:${et.fullName}:${nav.name}`,
            severity: 'tip',
            category: 'modeling',
            target: et.fullName,
            targetKind: 'entityType',
            title: `Consider adding Partner="${inverse.name}" on ${et.name}.${nav.name}`,
            message: `"${et.name}.${nav.name}" points to "${targetEntity.name}", which also navigates back via "${inverse.name}", but no Partner attribute links the pair.`,
            whyItMatters:
              'Setting Partner lets OData clients, ORMs, and ER diagrams recognize bidirectional relationships instead of treating them as two unrelated edges.',
            exampleCsdl: `<NavigationProperty Name="${nav.name}" Type="${nav.isCollection ? `Collection(${nav.type})` : nav.type}" Partner="${inverse.name}" />`,
          });
        }
      }
    }
  }

  // 4. EntitySet checks: Capabilities, NavigationPropertyBindings, Descriptions, Concurrency
  for (const container of containers) {
    for (const es of container.entitySets) {
      const esTarget = `${container.fullName}/${es.name}`;
      const esAnnotations = getAnnotationsForTarget(model, esTarget, es.annotations);
      const et = findEntityType(model, es.entityType, container.namespace);

      if (model.version.startsWith('4') && !hasAnyCapabilities(esAnnotations)) {
        diagnostics.push({
          id: `missing-capabilities:${es.name}`,
          severity: 'tip',
          category: 'capabilities',
          target: es.name,
          targetKind: 'entitySet',
          title: `No Capabilities annotations on EntitySet "${es.name}"`,
          message: `EntitySet "${es.name}" does not declare Org.OData.Capabilities.V1 restrictions (FilterRestrictions, SortRestrictions, ExpandRestrictions, SearchRestrictions, or CRUD restrictions).`,
          whyItMatters:
            'Without Capabilities annotations, explorers and client SDKs assume every query option ($filter, $search, $expand, POST/PATCH/DELETE) is allowed until the server rejects requests at runtime.',
          exampleCsdl: `<EntitySet Name="${es.name}" EntityType="${es.entityType}">\n  <Annotation Term="Org.OData.Capabilities.V1.FilterRestrictions">\n    <Record>\n      <PropertyValue Property="Filterable" Bool="true" />\n    </Record>\n  </Annotation>\n  <Annotation Term="Org.OData.Capabilities.V1.SearchRestrictions">\n    <Record>\n      <PropertyValue Property="Searchable" Bool="false" />\n    </Record>\n  </Annotation>\n</EntitySet>`,
        });
      }

      if (model.version.startsWith('4') && et) {
        const navs = getAllNavigationProperties(model, et);
        const boundPaths = new Set(es.navigationPropertyBindings.map((b) => b.path));
        const unboundNavs = navs.filter((n) => !n.containsTarget && !boundPaths.has(n.name));

        if (unboundNavs.length > 0 && entitySets.length > 1) {
          diagnostics.push({
            id: `missing-nav-binding:${es.name}`,
            severity: 'warning',
            category: 'integrity',
            target: es.name,
            targetKind: 'entitySet',
            title: `Missing NavigationPropertyBinding on "${es.name}"`,
            message: `Non-contained navigation ${unboundNavs.length === 1 ? 'property' : 'properties'} ${unboundNavs.map((n) => `"${n.name}"`).join(', ')} on "${et.name}" ${unboundNavs.length === 1 ? 'has' : 'have'} no <NavigationPropertyBinding> in EntitySet "${es.name}".`,
            whyItMatters:
              'In OData v4, non-contained navigation properties should bind to a target EntitySet or Singleton so clients know where related entities live and how to resolve canonical URLs.',
            exampleCsdl: `<EntitySet Name="${es.name}" EntityType="${es.entityType}">\n  <NavigationPropertyBinding Path="${unboundNavs[0]?.name ?? 'Related'}" Target="TargetEntitySet" />\n</EntitySet>`,
          });
        }
      }

      if (model.version.startsWith('4') && !hasDescription(esAnnotations)) {
        diagnostics.push({
          id: `missing-es-desc:${es.name}`,
          severity: 'tip',
          category: 'discoverability',
          target: es.name,
          targetKind: 'entitySet',
          title: `Add Core.Description to EntitySet "${es.name}"`,
          message: `EntitySet "${es.name}" has no Org.OData.Core.V1.Description annotation.`,
          whyItMatters:
            'Human-readable Core.Description annotations surface directly in OData explorers, generated OpenAPI docs, and AI/developer tooling.',
          exampleCsdl: `<EntitySet Name="${es.name}" EntityType="${es.entityType}">\n  <Annotation Term="Org.OData.Core.V1.Description" String="Describes what ${es.name} represents and when to query it." />\n</EntitySet>`,
        });
      }
    }
  }

  // 5. Aggregate EntityType description tip (avoid noisy per-type spam)
  if (
    model.version.startsWith('4') &&
    allEntityTypes.length > 0 &&
    entityTypesMissingDesc === allEntityTypes.length
  ) {
    diagnostics.push({
      id: 'missing-type-descriptions',
      severity: 'tip',
      category: 'discoverability',
      targetKind: 'service',
      title: 'EntityTypes have no Core.Description annotations',
      message: `None of the ${allEntityTypes.length} EntityTypes include Org.OData.Core.V1.Description or LongDescription annotations.`,
      whyItMatters:
        'Annotating entity types and key properties turns $metadata into living documentation that stays in sync with your model.',
      exampleCsdl: `<Annotations Target="${allEntityTypes[0]?.fullName ?? 'Namespace.Entity'}">\n  <Annotation Term="Org.OData.Core.V1.Description" String="Primary domain entity..." />\n</Annotations>`,
    });
  }

  // 6. Unbound destructive-looking Actions without Description
  for (const op of getAllOperations(model)) {
    if (op.kind === 'action') {
      const opAnn = getAnnotationsForTarget(model, op.fullName, op.annotations);
      if (!hasDescription(opAnn)) {
        diagnostics.push({
          id: `undocumented-action:${op.fullName}`,
          severity: 'tip',
          category: 'discoverability',
          target: op.fullName,
          targetKind: 'operation',
          title: `Document side effects of Action "${op.name}"`,
          message: `Action "${op.name}" has no Core.Description annotation explaining its side effects.`,
          whyItMatters:
            'Unlike Functions (which are read-only GET requests), OData Actions mutate server state via POST. Describing side effects protects callers from accidental data changes.',
          exampleCsdl: `<Action Name="${op.name}" IsBound="${op.isBound}">\n  <Annotation Term="Org.OData.Core.V1.Description" String="Explains what state this POST action modifies." />\n</Action>`,
        });
      }
    }
  }

  const order: Record<MetadataDiagnostic['severity'], number> = { error: 0, warning: 1, tip: 2 };
  diagnostics.sort((a, b) => order[a.severity] - order[b.severity]);
  return diagnostics;
}
