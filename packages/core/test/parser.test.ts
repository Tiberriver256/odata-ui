import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findEntitySet,
  findEntityType,
  findEnumType,
  findSingleton,
  getAllComplexTypes,
  getAllEntitySets,
  getAllEntityTypes,
  getAllEnumTypes,
  getAllOperations,
  getAllProperties,
  getAnnotationsForTarget,
  getDerivedEntityTypes,
  getEffectiveKeys,
  getFilterablePropertyPaths,
  getPrimaryContainer,
  parseMetadata,
} from '../src/index.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');
const loadFixture = (name: string) => readFileSync(resolve(fixturesDir, name), 'utf8');

describe('parseMetadata — TripPin RESTier (OData v4 XML)', () => {
  const model = parseMetadata(loadFixture('trippin-restier.xml'));

  it('detects OData v4 XML and parses core schema counts', () => {
    expect(model.version).toBe('4.0');
    expect(model.sourceFormat).toBe('xml-v4');
    expect(getAllEntityTypes(model)).toHaveLength(10);
    expect(getAllComplexTypes(model)).toHaveLength(4);
    expect(getAllEnumTypes(model)).toHaveLength(2);
    expect(getAllEntitySets(model)).toHaveLength(3);
  });

  it('walks inheritance chains for Employee and Manager over Person', () => {
    const person = findEntityType(model, 'Person');
    const employee = findEntityType(model, 'Employee');
    const manager = findEntityType(model, 'Manager');
    expect(person).toBeDefined();
    expect(employee).toBeDefined();
    expect(manager).toBeDefined();

    const empProps = getAllProperties(model, employee!);
    expect(empProps.some((p) => p.name === 'UserName' && p.inherited)).toBe(true);
    expect(empProps.some((p) => p.name === 'Cost' && !p.inherited)).toBe(true);

    expect(getEffectiveKeys(model, manager!)).toEqual(['UserName']);
    expect(getDerivedEntityTypes(model, person!).map((d) => d.name)).toEqual(
      expect.arrayContaining(['Employee', 'Manager']),
    );
  });

  it('parses singletons, enums, operations, and OptimisticConcurrency annotation', () => {
    const me = findSingleton(model, 'Me');
    expect(me).toBeDefined();
    expect(me?.type).toContain('Person');

    const gender = findEnumType(model, 'PersonGender');
    expect(gender?.members.map((m) => m.name)).toEqual(['Male', 'Female', 'Unknown']);

    const ops = getAllOperations(model);
    expect(ops.some((o) => o.name === 'ResetDataSource' && o.kind === 'action')).toBe(true);
    expect(ops.some((o) => o.name === 'GetNearestAirport' && o.kind === 'function')).toBe(true);

    const airlinesSet = findEntitySet(model, 'Airlines');
    const container = getPrimaryContainer(model);
    const ann = getAnnotationsForTarget(
      model,
      `${container!.fullName}/Airlines`,
      airlinesSet!.annotations,
    );
    const concurrency = ann.find((a) => a.term.includes('OptimisticConcurrency'));
    expect(concurrency).toBeDefined();
    expect(concurrency?.value).toEqual(['Name']);
  });

  it('flattens nested complex property paths for filter builder', () => {
    const person = findEntityType(model, 'Person')!;
    const paths = getFilterablePropertyPaths(model, person);
    expect(paths.some((p) => p.path.join('/') === 'HomeAddress/City/Name')).toBe(true);
    expect(paths.some((p) => p.path.join('/') === 'Emails' && p.isCollection)).toBe(true);
  });
});

describe('parseMetadata — TripPin V4 RW (Capabilities, Containment, Media Stream)', () => {
  const model = parseMetadata(loadFixture('trippin-v4-rw.xml'));

  it('parses ContainsTarget, HasStream, and structured Capabilities annotations', () => {
    const person = findEntityType(model, 'Person')!;
    const tripsNav = person.navigationProperties.find((n) => n.name === 'Trips');
    expect(tripsNav?.containsTarget).toBe(true);
    expect(tripsNav?.isCollection).toBe(true);

    const photo = findEntityType(model, 'Photo')!;
    expect(photo.hasStream).toBe(true);

    const container = getPrimaryContainer(model)!;
    const people = findEntitySet(model, 'People')!;
    const peopleAnn = getAnnotationsForTarget(
      model,
      `${container.fullName}/People`,
      people.annotations,
    );
    expect(peopleAnn.some((a) => a.term.includes('Capabilities.V1.InsertRestrictions'))).toBe(true);
    expect(peopleAnn.some((a) => a.term.includes('Capabilities.V1.SearchRestrictions'))).toBe(true);
  });
});

describe('parseMetadata — OData V3 Sample (Association -> NavigationProperty normalization)', () => {
  const model = parseMetadata(loadFixture('odata-v3.xml'));

  it('detects v3 and translates Association ends into standard NavigationProperties', () => {
    expect(model.version).toBe('3.0');
    expect(model.sourceFormat).toBe('xml-v3');

    const product = findEntityType(model, 'Product')!;
    const categories = product.navigationProperties.find((n) => n.name === 'Categories');
    const supplier = product.navigationProperties.find((n) => n.name === 'Supplier');

    expect(categories).toBeDefined();
    expect(categories?.type).toContain('Category');
    expect(categories?.isCollection).toBe(true);

    expect(supplier).toBeDefined();
    expect(supplier?.type).toContain('Supplier');
    expect(supplier?.isCollection).toBe(false);
    expect(supplier?.nullable).toBe(true);
  });

  it('parses v3 FunctionImports and ValueAnnotations', () => {
    const container = getPrimaryContainer(model)!;
    expect(container.functionImports.some((f) => f.name === 'GetProductsByRating')).toBe(true);
    const product = findEntityType(model, 'Product')!;
    const ann = getAnnotationsForTarget(model, `${product.fullName}/Name`, product.annotations);
    expect(ann.length).toBeGreaterThanOrEqual(0);
    expect(model.schemas[0]!.annotations.length).toBeGreaterThan(0);
  });
});

describe('parseMetadata — OData v4.01 JSON CSDL', () => {
  const model = parseMetadata(loadFixture('trippin-v4.csdl.json'));

  it('parses $Kind, $Type, $Collection, self. resolution, @annotations, and emits $Reference warnings', () => {
    expect(model.version).toBe('4.01');
    expect(model.sourceFormat).toBe('json-v4');
    expect(model.warnings.length).toBe(1);
    expect(model.warnings[0]).toContain('$Reference');

    const person = findEntityType(model, 'Trippin.Person')!;
    expect(person.keys).toEqual(['UserName']);
    const trips = person.navigationProperties.find((n) => n.name === 'Trips');
    expect(trips?.type).toBe('Trippin.Trip');
    expect(trips?.isCollection).toBe(true);
    expect(trips?.containsTarget).toBe(true);

    const employee = findEntityType(model, 'Trippin.Employee')!;
    expect(employee.baseType).toBe('Trippin.Person');
    expect(getEffectiveKeys(model, employee)).toEqual(['UserName']);
  });
});
