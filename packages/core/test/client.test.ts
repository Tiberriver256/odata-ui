import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeQuery, fetchMetadata, parseODataEnvelope } from '../src/index.js';

const trippinXml = readFileSync(
  resolve(import.meta.dirname, 'fixtures/trippin-restier.xml'),
  'utf8',
);

describe('HTTP client — session redirect adoption & JSON envelopes', () => {
  it('adopts final redirected response.url as serviceRoot (TripPin session prefix)', async () => {
    const redirectedUrl =
      'https://services.odata.org/TripPinRESTierService/(S(abc123session))/$metadata';

    const mockFetch = vi.fn(async () => {
      const resp = new Response(trippinXml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
      Object.defineProperty(resp, 'url', { value: redirectedUrl });
      return resp;
    });

    const result = await fetchMetadata('https://services.odata.org/TripPinRESTierService', {
      fetch: mockFetch as unknown as typeof fetch,
    });

    expect(result.serviceRoot).toBe(
      'https://services.odata.org/TripPinRESTierService/(S(abc123session))',
    );
    expect(result.model.version).toBe('4.0');
  });

  it('sends Accept: application/json;odata.metadata=minimal, custom headers, and invokes requestInterceptor', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = '';

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response(
        JSON.stringify({
          '@odata.context': '$metadata#People',
          '@odata.count': 20,
          '@odata.nextLink': 'https://example.org/People?$skip=2',
          value: [{ UserName: 'russellwhyte' }, { UserName: 'scottketchum' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const res = await executeQuery('https://example.org/People?$top=2', {
      headers: async () => ({ Authorization: 'Bearer test-token' }),
      requestInterceptor: (req) => ({ ...req, url: `${req.url}&$count=true` }),
      fetch: mockFetch as unknown as typeof fetch,
    });

    expect(capturedUrl).toBe('https://example.org/People?$top=2&$count=true');
    expect(capturedHeaders.Accept).toBe('application/json;odata.metadata=minimal');
    expect(capturedHeaders.Authorization).toBe('Bearer test-token');
    expect(res.rows).toHaveLength(2);
    expect(res.count).toBe(20);
    expect(res.nextLink).toBe('https://example.org/People?$skip=2');
  });

  it('normalizes v2/v3 verbose JSON envelopes and single entities', () => {
    const v2 = parseODataEnvelope({
      d: {
        results: [{ ID: 1, Name: 'Bread' }],
        __count: '11',
        __next: 'https://example.org/Products?$skiptoken=1',
      },
    });
    expect(v2.rows).toEqual([{ ID: 1, Name: 'Bread' }]);
    expect(v2.count).toBe(11);
    expect(v2.nextLink).toBe('https://example.org/Products?$skiptoken=1');

    const single = parseODataEnvelope({ UserName: 'russellwhyte', FirstName: 'Russell' });
    expect(single.isSingleValue).toBe(true);
    expect(single.rows).toEqual([{ UserName: 'russellwhyte', FirstName: 'Russell' }]);
  });
});
