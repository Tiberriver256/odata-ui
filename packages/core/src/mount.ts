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
import { icon } from './ui/icons.js';
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
  onThemeChange?: (resolvedTheme: 'light' | 'dark') => void;
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
  let lastNotifiedTheme: 'light' | 'dark' | null = null;
  let prevActiveTab: ActiveTab | null = null;
  let prevSelectedKey: string | null = null;
  let scrollToResultsPending = false;

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
      expandedNestedKeys: [],
      expandedNavDrawers: {},
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
      scrollToResultsPending = true;
      store.setState({
        queryLoading: false,
        queryResult: res,
        queryError: null,
      });
    } catch (err) {
      if (unmounted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      scrollToResultsPending = true;
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

    if (state.resolvedTheme !== lastNotifiedTheme) {
      lastNotifiedTheme = state.resolvedTheme;
      options.onThemeChange?.(state.resolvedTheme);
      if (typeof CustomEvent !== 'undefined') {
        element.dispatchEvent(
          new CustomEvent('odata-ui:theme-change', {
            detail: { theme: state.theme, resolvedTheme: state.resolvedTheme },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }

    // Preserve scroll positions across in-place re-renders (only reset when tab or selected item changes)
    const prevContent = root.querySelector('.oui-content') as HTMLElement | null;
    const prevTree = root.querySelector('.oui-tree-scroll') as HTMLElement | null;
    const savedContentScrollTop = prevContent?.scrollTop ?? 0;
    const savedContentScrollLeft = prevContent?.scrollLeft ?? 0;
    const savedTreeScrollTop = prevTree?.scrollTop ?? 0;

    const selectedKey = state.selected ? `${state.selected.kind}:${state.selected.id}` : null;
    const shouldResetContentScroll =
      prevActiveTab !== null &&
      (prevActiveTab !== state.activeTab ||
        (state.activeTab === 'details' && prevSelectedKey !== selectedKey));
    prevActiveTab = state.activeTab;
    prevSelectedKey = selectedKey;

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
    if (state.sidebarOpenMobile) {
      sidebar.classList.add('open');
    }

    const menuBtn = el(
      'button',
      {
        type: 'button',
        class: 'oui-btn oui-btn-sm oui-btn-ghost oui-mobile-menu-btn',
        'aria-label': 'Toggle schema tree',
      },
      icon('menu', 14),
      'Schema',
    );
    menuBtn.addEventListener('click', () => {
      store.setState({ sidebarOpenMobile: !state.sidebarOpenMobile });
    });

    // Tabs
    const tabsDef: Array<{
      id: ActiveTab;
      label: string;
      iconName: 'layers' | 'share' | 'terminal' | 'shield';
      count?: number;
    }> = [
      { id: 'details', label: 'Details', iconName: 'layers' },
      { id: 'diagram', label: 'Diagram', iconName: 'share' },
      { id: 'query', label: 'Query', iconName: 'terminal' },
      { id: 'advisor', label: 'Advisor', iconName: 'shield', count: state.diagnostics.length },
    ];

    const tabBar = el(
      'div',
      { class: 'oui-tabs', role: 'tablist' },
      menuBtn,
      ...tabsDef.map((t) => {
        const btn = el(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': state.activeTab === t.id ? 'true' : 'false',
            class: `oui-tab${state.activeTab === t.id ? ' active' : ''}`,
          },
          icon(t.iconName, 13),
          t.label,
          t.count !== undefined && state.model ? el('span', { class: 'oui-badge' }, t.count) : null,
        );
        btn.addEventListener('click', () =>
          store.setState({ activeTab: t.id, sidebarOpenMobile: false }),
        );
        return btn;
      }),
    );

    const content = el('div', {
      class: state.activeTab === 'diagram' ? 'oui-content oui-content-flush' : 'oui-content',
    });

    if (state.loadingMetadata && !state.model) {
      content.appendChild(
        el(
          'div',
          {
            class: 'oui-skeleton-wrap',
            style: state.activeTab === 'diagram' ? 'padding:18px 20px;' : '',
          },
          el('div', { class: 'oui-skeleton-line', style: 'width:38%; height:22px;' }),
          el('div', { class: 'oui-skeleton-line', style: 'width:62%;' }),
          el('div', {
            class: 'oui-skeleton-line',
            style: 'width:100%; height:140px; margin-top:8px;',
          }),
        ),
      );
    } else {
      if (state.metadataError && state.activeTab !== 'details') {
        content.appendChild(
          el(
            'div',
            { class: 'oui-banner oui-banner-error' },
            icon('alert', 15),
            el('span', {}, state.metadataError),
          ),
        );
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
    }

    const main = el('main', { class: 'oui-main' }, tabBar, content);
    const backdrop = state.sidebarOpenMobile ? el('div', { class: 'oui-sidebar-backdrop' }) : null;
    backdrop?.addEventListener('click', () => store.setState({ sidebarOpenMobile: false }));

    root.appendChild(el('div', { class: 'oui-body' }, sidebar, backdrop, main));

    const nextTree = root.querySelector('.oui-tree-scroll') as HTMLElement | null;
    if (nextTree && savedTreeScrollTop > 0) {
      nextTree.scrollTop = savedTreeScrollTop;
    }

    if (scrollToResultsPending && state.activeTab === 'query') {
      scrollToResultsPending = false;
      const resultsBar = content.querySelector('.oui-results-bar') as HTMLElement | null;
      const errorBanner = content.querySelector('.oui-results-error') as HTMLElement | null;
      const target = resultsBar ?? errorBanner;
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } else if (!shouldResetContentScroll) {
      content.scrollTop = savedContentScrollTop;
      content.scrollLeft = savedContentScrollLeft;
    }

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
