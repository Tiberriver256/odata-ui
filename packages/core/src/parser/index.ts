import type { ODataModel, ODataVersion } from '../model/types.js';
import { parseJsonV4 } from './json-v4.js';
import { attr, firstChildElement } from './xml-utils.js';
import { parseXmlV23 } from './xml-v23.js';
import { parseXmlV4 } from './xml-v4.js';

export function parseMetadata(input: string): ODataModel {
  const cleaned = input.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    throw new Error('Metadata document is empty.');
  }

  if (cleaned.startsWith('{')) {
    return parseJsonV4(cleaned);
  }

  if (!cleaned.startsWith('<')) {
    throw new Error(
      'Unrecognized metadata format: expected XML (<edmx:Edmx>) or JSON CSDL ({...}).',
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleaned, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent?.trim() ?? 'malformed XML'}`);
  }

  const root = doc.documentElement;
  const edmxVersion = attr(root, 'Version') ?? '';
  const dataServices = firstChildElement(root, 'DataServices');
  const dsv = dataServices
    ? (attr(dataServices, 'MaxDataServiceVersion') ??
      attr(dataServices, 'DataServiceVersion') ??
      '')
    : '';

  if (edmxVersion === '4.01') {
    return parseXmlV4(doc, '4.01', cleaned);
  }
  if (edmxVersion === '4.0' || root.namespaceURI === 'http://docs.oasis-open.org/odata/ns/edmx') {
    return parseXmlV4(doc, '4.0', cleaned);
  }

  const version: ODataVersion = dsv.startsWith('2') ? '2.0' : '3.0';
  return parseXmlV23(doc, version, cleaned);
}

export { parseJsonV4, parseXmlV23, parseXmlV4 };
