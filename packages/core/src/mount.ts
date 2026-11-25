import {
  executeQuery,
  fetchMetadata,
  type HeadersProvider,
  type RequestInterceptor,
} from './client/http.js';
import { parseMetadata } from './parser/index.js';
import stylesCss from './styles/odata-ui.css?inline';
import { renderAdvisorView } from './ui/advisor-view.js';
import { renderDetailsView } from './ui/details-view.js';
import { renderDiagramView } from './ui/diagram-view.js';
import { clear, el } from './ui/dom.js';
import { renderMetadataTree } from './ui/metadata-tree.js';
import { renderQueryBuilder } from './ui/query-builder.js';
import { renderResultsView } from './ui/results-view.js';
import {
  ExplorerStore,
  resolveEffectiveTheme,
  type ActiveTab,
  type ThemeMode,
} from './ui/store.js';
import { renderTopBar } from './ui/top-bar.js';

export interface ODataUIMountOptions {
  url?: string;
  metadata?: string;
  headers?: HeadersProvider;
  requestInterceptor?: RequestInterceptor;
  theme?: ThemeMode;
  fetch?: typeof globalThis.fetch;
}

export interface ODataUIOptions extends ODataUIMountOptions {
  dom_id?: string;
  domNode?: HTMLElement;
}

export interface ODataUIInstance {
  unmount(): void;
  setUrl(url: string): Promise<void>;
  loadMetadata(raw: string, serviceRoot?: string): void;
  setTheme(theme: ThemeMode): void;
}

export function mount(element: HTMLElement, options: ODataUIMountOptions = {}): ODataUIInstance {
  const store = new ExplorerStore({
    inputUrl: options.url ?? '',
    serviceRoot: options.url
      ? options.url.replace(/\/\$metadata(\?.*)?$/i, '').replace(/\/+$/, '')
      : '',
    theme: options.theme ?? 'auto',
    headersProvider: options.headers,
    requestInterceptor: options.requestInterceptor,
  });

  // Own an isolated open Shadow Root; reuse if element already has one
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  clear(shadow as unknown as Element);

  const styleTag = document.createElement('style');
  styleTag.textContent = stylesCss;
  shadow.appendChild(styleTag);

  const root = el('div', { class: 'oui-root' });
  shadow.appendChild(root);

  let metadataAbort: AbortController | null = null;
  let queryAbort: AbortController | null = null;
  let unmounted = false;

  const loadFromUrl = async (url: string): Promise<void> => {
    metadataAbort?.abort();
    metadataAbort = new AbortController();
    store.setState({
      inputUrl: url,
      loadingMetadata: true,
      metadataError: null,
    });

    try {
      const result = await fetchMetadata(url, {
        headers: options.headers,
        extraHeaders: store.getEffectiveExtraHeaders(),
        requestInterceptor: options.requestInterceptor,
        fetch: options.fetch,
        signal: metadataAbort.signal,
      });
      if (unmounted) return;
      store.setModel(result.model, result.serviceRoot, url);
    } catch (err) {
      if (unmounted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      store.setState({
        loadingMetadata: false,
        metadataError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const loadFromRaw = (raw: string, serviceRoot = ''): void => {
    try {
      const model = parseMetadata(raw);
      store.setModel(model, serviceRoot, serviceRoot);
    } catch (err) {
      store.setState({
        loadingMetadata: false,
        metadataError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const runQuery = async (
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, unknown>,
    pushHistory?: string,
  ): Promise<void> => {
    queryAbort?.abort();
    queryAbort = new AbortController();
    const prevState = store.getState();
    const nextStack = pushHistory
      ? [...prevState.pageStack, pushHistory]
      : method === 'GET' && !pushHistory
        ? []
        : prevState.pageStack;

    store.setState({
      queryLoading: true,
      queryError: null,
      pageStack: nextStack,
    });

    try {
      const res = await executeQuery(url, {
        method,
        body,
        headers: options.headers,
        extraHeaders: store.getEffectiveExtraHeaders(),
        requestInterceptor: options.requestInterceptor,
        fetch: options.fetch,
        version: prevState.model?.version,
        signal: queryAbort.signal,
      });
      if (unmounted) return;
      store.setState({
        queryLoading: false,
        queryResult: res,
        queryError: null,
      });
    } catch (err) {
      if (unmounted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      store.setState({
        queryLoading: false,
        queryError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const render = () => {
    const state = store.getState();
    root.setAttribute('data-theme', state.resolvedTheme);
    element.setAttribute('data-theme', state.resolvedTheme);

    // Preserve focus on text/search inputs if the user is actively typing
    const activeEl = shadow.activeElement as HTMLInputElement | null;
    const focusInfo =
      activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
        ? {
            ariaLabel: activeEl.getAttribute('aria-label'),
            placeholder: activeEl.getAttribute('placeholder'),
            start: activeEl.selectionStart,
            end: activeEl.selectionEnd,
          }
        : null;

    clear(root);

    root.appendChild(
      renderTopBar(state, store, {
        onLoadUrl: (url) => {
          void loadFromUrl(url);
        },
        onUploadFile: (content) => {
          loadFromRaw(content, '');
        },
      }),
    );

    const sidebar = renderMetadataTree(state, store);

    // Tabs
    const tabsDef: Array<{ id: ActiveTab; label: string; count?: number }> = [
      { id: 'details', label: 'Details' },
      { id: 'diagram', label: 'Diagram' },
      { id: 'query', label: 'Query' },
      { id: 'advisor', label: 'Metadata Advisor', count: state.diagnostics.length },
    ];

    const tabBar = el(
      'div',
      { class: 'oui-tabs', role: 'tablist' },
      ...tabsDef.map((t) => {
        const btn = el(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': state.activeTab === t.id ? 'true' : 'false',
            class: `oui-tab${state.activeTab === t.id ? ' active' : ''}`,
          },
          t.label,
          t.count !== undefined && state.model ? el('span', { class: 'oui-badge' }, t.count) : null,
        );
        btn.addEventListener('click', () => store.setState({ activeTab: t.id }));
        return btn;
      }),
    );

    const content = el('div', {
      class: state.activeTab === 'diagram' ? 'oui-content oui-content-flush' : 'oui-content',
    });

    if (state.metadataError && state.activeTab !== 'details') {
      content.appendChild(el('div', { class: 'oui-banner oui-banner-error' }, state.metadataError));
    }

    if (state.activeTab === 'details') {
      content.appendChild(renderDetailsView(state, store));
    } else if (state.activeTab === 'diagram') {
      content.appendChild(renderDiagramView(state, store));
    } else if (state.activeTab === 'advisor') {
      content.appendChild(renderAdvisorView(state, store));
    } else {
      content.appendChild(
        renderQueryBuilder(state, store, {
          onRunQuery: (url, method, body) => {
            void runQuery(url, method, body);
          },
        }),
      );
      content.appendChild(
        renderResultsView(state, store, {
          onFollowNextLink: (nextLink) => {
            const currentUrl = state.queryResult?.url ?? state.editableUrl;
            void runQuery(nextLink, 'GET', undefined, currentUrl);
          },
          onPreviousPage: () => {
            const stack = [...state.pageStack];
            const prevUrl = stack.pop();
            if (!prevUrl) return;
            store.setState({ pageStack: stack });
            void runQuery(prevUrl, 'GET');
          },
          onOpenNavUrl: (navUrl) => {
            store.setState({
              editableUrl: navUrl,
              urlManuallyEdited: true,
              activeTab: 'query',
            });
            void runQuery(navUrl, 'GET');
          },
        }),
      );
    }

    const main = el('main', { class: 'oui-main' }, tabBar, content);
    root.appendChild(el('div', { class: 'oui-body' }, sidebar, main));

    if (focusInfo) {
      const selector = focusInfo.ariaLabel
        ? `[aria-label="${CSS.escape(focusInfo.ariaLabel)}"]`
        : focusInfo.placeholder
          ? `[placeholder="${CSS.escape(focusInfo.placeholder)}"]`
          : null;
      if (selector) {
        const nextInput = shadow.querySelector(selector) as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          if (focusInfo.start !== null && focusInfo.end !== null) {
            try {
              nextInput.setSelectionRange(focusInfo.start, focusInfo.end);
            } catch {
              // ignore non-selectable inputs (e.g. number)
            }
          }
        }
      }
    }
  };

  const unsubscribe = store.subscribe(render);

  // System dark mode listener when theme === 'auto'
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const onMediaChange = () => {
    if (store.getState().theme === 'auto') {
      store.setState({ resolvedTheme: resolveEffectiveTheme('auto') });
    }
  };
  media?.addEventListener('change', onMediaChange);

  // Initial render + load
  render();
  if (options.metadata) {
    loadFromRaw(options.metadata, options.url ?? '');
  } else if (options.url) {
    void loadFromUrl(options.url);
  }

  return {
    unmount() {
      unmounted = true;
      metadataAbort?.abort();
      queryAbort?.abort();
      unsubscribe();
      media?.removeEventListener('change', onMediaChange);
      clear(shadow as unknown as Element);
    },
    async setUrl(url: string) {
      await loadFromUrl(url);
    },
    loadMetadata(raw: string, serviceRoot?: string) {
      loadFromRaw(raw, serviceRoot ?? '');
    },
    setTheme(theme: ThemeMode) {
      store.setState({ theme, resolvedTheme: resolveEffectiveTheme(theme) });
    },
  };
}

export function ODataUI(options: ODataUIOptions): ODataUIInstance {
  let target: HTMLElement | null = options.domNode ?? null;
  if (!target && options.dom_id) {
    const cleanId = options.dom_id.startsWith('#') ? options.dom_id.slice(1) : options.dom_id;
    target = document.getElementById(cleanId);
  }
  if (!target) {
    throw new Error(
      `ODataUI: target element not found (provided dom_id="${options.dom_id ?? ''}").`,
    );
  }
  return mount(target, options);
}
