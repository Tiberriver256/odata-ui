import { describe, expect, it } from 'vitest';
import { printExpand, printFilter, printQuery, type QueryAst } from '../src/index.js';

const ROOT = 'https://services.odata.org/TripPinRESTierService';

describe('printQuery & printFilter', () => {
  it('prints typed single keys, embedded quote escaping, and composite keys', () => {
    const strKey: QueryAst = {
      targetKind: 'entitySet',
      targetName: 'People',
      keyValues: [{ name: 'UserName', edmType: 'Edm.String', value: "o'brien" }],
      select: [],
      expand: [],
      orderby: [],
    };
    expect(printQuery(ROOT, strKey).readableUrl).toBe(`${ROOT}/People('o''brien')`);

    const intKey: QueryAst = {
      targetKind: 'entitySet',
      targetName: 'Trips',
      keyValues: [{ name: 'TripId', edmType: 'Edm.Int32', value: '1' }],
      select: [],
      expand: [],
      orderby: [],
    };
    expect(printQuery(ROOT, intKey).readableUrl).toBe(`${ROOT}/Trips(1)`);

    const composite: QueryAst = {
      targetKind: 'entitySet',
      targetName: 'OrderLines',
      keyValues: [
        { name: 'OrderId', edmType: 'Edm.Int32', value: '10' },
        { name: 'Sku', edmType: 'Edm.String', value: 'ABC' },
      ],
      select: [],
      expand: [],
      orderby: [],
    };
    expect(printQuery(ROOT, composite).readableUrl).toBe(
      `${ROOT}/OrderLines(OrderId=10,Sku='ABC')`,
    );
  });

  it('parenthesizes mixed and/or groups, supports not, enums, in, and collection lambdas', () => {
    const expr = printFilter(
      {
        kind: 'group',
        op: 'and',
        children: [
          {
            kind: 'group',
            op: 'or',
            children: [
              {
                kind: 'comparison',
                path: ['FirstName'],
                op: 'eq',
                value: { kind: 'string', value: 'Russell' },
              },
              { kind: 'stringFn', path: ['LastName'], fn: 'startswith', value: "O'K" },
            ],
          },
          {
            kind: 'comparison',
            path: ['Gender'],
            op: 'eq',
            value: { kind: 'enum', enumType: 'Trippin.PersonGender', member: 'Male' },
          },
          {
            kind: 'lambda',
            collectionPath: ['Emails'],
            quantifier: 'any',
            alias: 'e',
            predicate: {
              kind: 'comparison',
              path: ['e'],
              op: 'eq',
              value: { kind: 'string', value: 'russell@example.com' },
            },
          },
          {
            kind: 'in',
            path: ['HomeAddress', 'City', 'Name'],
            values: [
              { kind: 'string', value: 'Boise' },
              { kind: 'string', value: 'Seattle' },
            ],
          },
        ],
      },
      '4.0',
    );

    expect(expr).toBe(
      "(FirstName eq 'Russell' or startswith(LastName,'O''K')) and Gender eq Trippin.PersonGender'Male' and Emails/any(e:e eq 'russell@example.com') and HomeAddress/City/Name in ('Boise','Seattle')",
    );
  });

  it('adapts string functions, guids, dates, and in-lists for OData v3', () => {
    const fixedNow = new Date('2026-11-24T12:00:00.000Z');
    const expr = printFilter(
      {
        kind: 'group',
        op: 'and',
        children: [
          { kind: 'stringFn', path: ['Name'], fn: 'contains', value: 'Milk' },
          {
            kind: 'comparison',
            path: ['ReleaseDate'],
            op: 'gt',
            value: { kind: 'relativeDate', preset: '7d-ago', edmType: 'Edm.DateTime' },
          },
          {
            kind: 'in',
            path: ['Rating'],
            values: [
              { kind: 'number', value: 4, edmType: 'Edm.Int32' },
              { kind: 'number', value: 5, edmType: 'Edm.Int32' },
            ],
          },
        ],
      },
      '3.0',
      fixedNow,
    );

    expect(expr).toBe(
      "substringof('Milk',Name) and ReleaseDate gt datetime'2026-11-17T12:00:00' and (Rating eq 4 or Rating eq 5)",
    );
  });

  it('prints recursive v4 $expand with semicolon-separated nested options', () => {
    const expanded = printExpand(
      [
        {
          property: 'Trips',
          select: ['Name', 'Budget'],
          top: 5,
          orderby: [{ path: 'Budget', direction: 'desc' }],
          expand: [{ property: 'PlanItems', select: ['ConfirmationCode'] }],
        },
      ],
      '4.0',
    );

    expect(expanded).toBe(
      'Trips($select=Name,Budget;$orderby=Budget desc;$top=5;$expand=PlanItems($select=ConfirmationCode))',
    );
  });

  it('hoists $filter inside $apply when groupby/aggregate is active', () => {
    const ast: QueryAst = {
      targetKind: 'entitySet',
      targetName: 'Trips',
      filter: {
        kind: 'comparison',
        path: ['Budget'],
        op: 'gt',
        value: { kind: 'number', value: 500 },
      },
      apply: {
        groupBy: ['Name'],
        aggregates: [
          { property: 'Budget', method: 'sum', alias: 'TotalBudget' },
          { method: '$count', alias: 'TripCount' },
        ],
      },
      select: [],
      expand: [],
      orderby: [],
    };

    const printed = printQuery(ROOT, ast);
    expect(printed.readableUrl).toBe(
      `${ROOT}/Trips?$apply=filter(Budget gt 500)/groupby((Name),aggregate(Budget with sum as TotalBudget,$count as TripCount))`,
    );
    expect(printed.readableUrl).not.toContain('$filter=');
    expect(printed.fetchUrl).toContain('%20gt%20500');
  });

  it('prints unbound functions as GET with params and actions as explicit POST', () => {
    const fnAst: QueryAst = {
      targetKind: 'functionImport',
      targetName: 'GetNearestAirport',
      operationParams: [
        { name: 'lat', edmType: 'Edm.Double', value: '33' },
        { name: 'lon', edmType: 'Edm.Double', value: '-118' },
      ],
      select: [],
      expand: [],
      orderby: [],
    };
    const fnOut = printQuery(ROOT, fnAst);
    expect(fnOut.method).toBe('GET');
    expect(fnOut.readableUrl).toBe(`${ROOT}/GetNearestAirport(lat=33,lon=-118)`);

    const actAst: QueryAst = {
      targetKind: 'actionImport',
      targetName: 'ResetDataSource',
      select: [],
      expand: [],
      orderby: [],
    };
    const actOut = printQuery(ROOT, actAst);
    expect(actOut.method).toBe('POST');
    expect(actOut.readableUrl).toBe(`${ROOT}/ResetDataSource`);
  });
});
