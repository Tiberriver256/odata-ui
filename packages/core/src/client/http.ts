import { parseMetadata } from '../parser/index.js';
import type { ODataModel, ODataVersion } from '../model/types.js';

export type HeadersProvider =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

export type RequestInterceptor = (
  request: RequestInit & { url: string },
) => (RequestInit & { url: string }) | Promise<RequestInit & { url: string }>;

export interface ClientOptions {
  headers?: HeadersProvider;
  extraHeaders?: Record<string, string>;
  requestInterceptor?: RequestInterceptor;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface MetadataFetchResult {
  model: ODataModel;
  serviceRoot: string;
  metadataUrl: string;
  raw: string;
  status: number;
  durationMs: number;
}

export interface QueryExecutionResult {
  url: string;
  method: 'GET' | 'POST';
  status: number;
  statusText: string;
  durationMs: number;
  rows: Record<string, unknown>[];
  isSingleValue: boolean;
  scalarValue?: unknown;
  count?: number;
  nextLink?: string;
  context?: string;
  rawJson: unknown;
  rawText: string;
}

export function normalizeServiceRoot(inputUrl: string): {
  serviceRoot: string;
  metadataUrl: string;
} {
  const trimmed = inputUrl.trim().replace(/\/+$/, '');
  if (/\/\$metadata(\?.*)?$/i.test(trimmed)) {
    return {
      serviceRoot: trimmed.replace(/\/\$metadata(\?.*)?$/i, ''),
      metadataUrl: trimmed,
    };
  }
  return {
    serviceRoot: trimmed,
    metadataUrl: `${trimmed}/$metadata`,
  };
}

async function resolveHeaders(options: ClientOptions): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  if (options.headers) {
    const provided =
      typeof options.headers === 'function' ? await options.headers() : options.headers;
    Object.assign(merged, provided);
  }
  if (options.extraHeaders) {
    Object.assign(merged, options.extraHeaders);
  }
  return merged;
}

async function sendRequest(
  url: string,
  init: RequestInit,
  options: ClientOptions,
): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let req: RequestInit & { url: string } = { ...init, url };
  if (options.requestInterceptor) {
    req = await options.requestInterceptor(req);
  }
  const { url: finalUrl, ...fetchInit } = req;
  return fetchImpl(finalUrl, fetchInit);
}

function extractODataErrorMessage(bodyText: string, status: number, statusText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const errObj = (parsed.error ?? parsed['odata.error']) as Record<string, unknown> | undefined;
    if (errObj) {
      const msg = errObj.message;
      if (typeof msg === 'string') return msg;
      if (
        msg &&
        typeof msg === 'object' &&
        'value' in msg &&
        typeof (msg as { value?: unknown }).value === 'string'
      ) {
        return (msg as { value: string }).value;
      }
    }
  } catch {
    // Try XML error message fallback
    const match = /<[^>]*message[^>]*>([\s\S]*?)<\/[^>]*message>/i.exec(bodyText);
    if (match?.[1]) return match[1].trim();
  }
  return `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
}

export async function fetchMetadata(
  inputUrl: string,
  options: ClientOptions = {},
): Promise<MetadataFetchResult> {
  const { serviceRoot: initialRoot, metadataUrl } = normalizeServiceRoot(inputUrl);
  const headers = await resolveHeaders(options);
  if (!headers.Accept && !headers.accept) {
    headers.Accept = 'application/xml, application/json;q=0.9, */*;q=0.8';
  }

  const start = performance.now();
  const response = await sendRequest(
    metadataUrl,
    {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: options.signal,
    },
    options,
  );
  const raw = await response.text();
  const durationMs = Math.round(performance.now() - start);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch $metadata: ${extractODataErrorMessage(raw, response.status, response.statusText)}`,
    );
  }

  // Adopt redirected response.url so session prefixes like TripPin's (S(session)) are preserved
  let resolvedRoot = initialRoot;
  let resolvedMetadataUrl = metadataUrl;
  if (response.url) {
    resolvedMetadataUrl = response.url;
    if (/\/\$metadata(\?.*)?$/i.test(response.url)) {
      resolvedRoot = response.url.replace(/\/\$metadata(\?.*)?$/i, '');
    } else {
      resolvedRoot = response.url.replace(/\/+$/, '');
    }
  }

  const model = parseMetadata(raw);
  return {
    model,
    serviceRoot: resolvedRoot,
    metadataUrl: resolvedMetadataUrl,
    raw,
    status: response.status,
    durationMs,
  };
}

export async function executeQuery(
  url: string,
  options: ClientOptions & {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    version?: ODataVersion;
  } = {},
): Promise<QueryExecutionResult> {
  const method = options.method ?? 'GET';
  const headers = await resolveHeaders(options);

  if (!headers.Accept && !headers.accept) {
    headers.Accept =
      options.version && !options.version.startsWith('4')
        ? 'application/json;odata=verbose, application/json'
        : 'application/json;odata.metadata=minimal';
  }

  let bodyStr: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    bodyStr = JSON.stringify(options.body ?? {});
  }

  const start = performance.now();
  const response = await sendRequest(
    url,
    {
      method,
      headers,
      body: bodyStr,
      redirect: 'follow',
      signal: options.signal,
    },
    options,
  );
  const rawText = await response.text();
  const durationMs = Math.round(performance.now() - start);

  if (!response.ok) {
    throw new Error(extractODataErrorMessage(rawText, response.status, response.statusText));
  }

  if (response.status === 204 || rawText.trim() === '') {
    return {
      url: response.url || url,
      method,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      rows: [],
      isSingleValue: true,
      rawJson: null,
      rawText,
    };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    // Plain text (e.g. /$count or primitive $value)
    return {
      url: response.url || url,
      method,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      rows: [],
      isSingleValue: true,
      scalarValue: rawText.trim(),
      rawJson: rawText.trim(),
      rawText,
    };
  }

  const parsed = parseODataEnvelope(rawJson);

  return {
    url: response.url || url,
    method,
    status: response.status,
    statusText: response.statusText,
    durationMs,
    ...parsed,
    rawJson,
    rawText,
  };
}

export function parseODataEnvelope(json: unknown): {
  rows: Record<string, unknown>[];
  isSingleValue: boolean;
  scalarValue?: unknown;
  count?: number;
  nextLink?: string;
  context?: string;
} {
  if (json === null || typeof json !== 'object') {
    return { rows: [], isSingleValue: true, scalarValue: json };
  }

  if (Array.isArray(json)) {
    const rows = json.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { value: item },
    );
    return { rows, isSingleValue: false };
  }

  const obj = json as Record<string, unknown>;
  const context = typeof obj['@odata.context'] === 'string' ? obj['@odata.context'] : undefined;

  // OData v4 collection envelope
  if (Array.isArray(obj.value)) {
    const rawCount = obj['@odata.count'] ?? obj['odata.count'];
    const count =
      typeof rawCount === 'number'
        ? rawCount
        : typeof rawCount === 'string'
          ? Number.parseInt(rawCount, 10)
          : undefined;
    const nextLink =
      typeof obj['@odata.nextLink'] === 'string'
        ? obj['@odata.nextLink']
        : typeof obj['odata.nextLink'] === 'string'
          ? obj['odata.nextLink']
          : undefined;
    const rows = obj.value.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { value: item },
    );
    return { rows, isSingleValue: false, count, nextLink, context };
  }

  // OData v4 primitive value wrapper: { "@odata.context": "...", "value": "scalar" }
  if ('value' in obj && Object.keys(obj).every((k) => k === 'value' || k.startsWith('@odata.'))) {
    return {
      rows: [{ value: obj.value }],
      isSingleValue: true,
      scalarValue: obj.value,
      context,
    };
  }

  // OData v2/v3 verbose JSON envelope { d: { results: [...], __next, __count } }
  if (obj.d !== undefined) {
    if (Array.isArray(obj.d)) {
      const rows = obj.d.map((item) =>
        item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item },
      );
      return { rows, isSingleValue: false };
    }
    if (obj.d && typeof obj.d === 'object') {
      const dObj = obj.d as Record<string, unknown>;
      if (Array.isArray(dObj.results)) {
        const rawCount = dObj['__count'];
        const count =
          typeof rawCount === 'string'
            ? Number.parseInt(rawCount, 10)
            : typeof rawCount === 'number'
              ? rawCount
              : undefined;
        const rawNext = dObj['__next'];
        const nextLink = typeof rawNext === 'string' ? rawNext : undefined;
        const rows = dObj.results.map((item) =>
          item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item },
        );
        return { rows, isSingleValue: false, count, nextLink };
      }
      return { rows: [dObj], isSingleValue: true };
    }
    return { rows: [{ value: obj.d }], isSingleValue: true, scalarValue: obj.d };
  }

  // Single entity object
  return { rows: [obj], isSingleValue: true, context };
}
