import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeMetadata, parseMetadata } from '../src/index.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');
const loadFixture = (name: string) => readFileSync(resolve(fixturesDir, name), 'utf8');

describe('analyzeMetadata (Metadata Advisor)', () => {
  it('flags missing Capabilities and Core.Description tips on TripPin RESTier', () => {
    const model = parseMetadata(loadFixture('trippin-restier.xml'));
    const diags = analyzeMetadata(model);

    expect(diags.some((d) => d.id === 'missing-capabilities:People')).toBe(true);
    expect(diags.some((d) => d.id === 'missing-es-desc:People')).toBe(true);
    expect(diags.some((d) => d.id.startsWith('undocumented-action:'))).toBe(true);
  });

  it('recognizes Capabilities annotations on TripPin V4 RW EntitySets', () => {
    const model = parseMetadata(loadFixture('trippin-v4-rw.xml'));
    const diags = analyzeMetadata(model);

    // People and Airlines declare Capabilities in TripPin V4 RW
    expect(diags.some((d) => d.id === 'missing-capabilities:People')).toBe(false);
    expect(diags.some((d) => d.id === 'missing-capabilities:Airlines')).toBe(false);
  });

  it('flags legacy v3 upgrade tip on OData V3 sample', () => {
    const model = parseMetadata(loadFixture('odata-v3.xml'));
    const diags = analyzeMetadata(model);

    expect(diags.some((d) => d.id === 'legacy-odata-version')).toBe(true);
  });

  it('detects structural integrity errors such as missing keys, nullable keys, and unresolved base types', () => {
    const brokenXml = `<?xml version="1.0" encoding="utf-8"?>
      <edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
        <edmx:DataServices>
          <Schema Namespace="Demo" xmlns="http://docs.oasis-open.org/odata/ns/edm">
            <EntityType Name="Broken" BaseType="Demo.DoesNotExist">
              <Property Name="Amount" Type="Edm.Decimal" />
            </EntityType>
            <EntityType Name="NullableKeyEntity">
              <Key><PropertyRef Name="Id" /></Key>
              <Property Name="Id" Type="Edm.Int32" />
            </EntityType>
            <EntityContainer Name="Container">
              <EntitySet Name="Items" EntityType="Demo.NullableKeyEntity" />
            </EntityContainer>
          </Schema>
        </edmx:DataServices>
      </edmx:Edmx>`;

    const model = parseMetadata(brokenXml);
    const diags = analyzeMetadata(model);

    expect(
      diags.some((d) => d.id === 'unresolved-basetype:Demo.Broken' && d.severity === 'error'),
    ).toBe(true);
    expect(diags.some((d) => d.id === 'missing-key:Demo.Broken' && d.severity === 'error')).toBe(
      true,
    );
    expect(
      diags.some(
        (d) => d.id === 'nullable-key:Demo.NullableKeyEntity:Id' && d.severity === 'warning',
      ),
    ).toBe(true);
    expect(
      diags.some((d) => d.id === 'decimal-precision:Demo.Broken:Amount' && d.severity === 'tip'),
    ).toBe(true);
  });
});
