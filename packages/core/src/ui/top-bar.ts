import { el } from './dom.js';
import type { ExplorerState, ExplorerStore } from './store.js';

export interface TopBarCallbacks {
  onLoadUrl: (url: string) => void;
  onUploadFile: (content: string, filename: string) => void;
}

export function renderTopBar(
  state: ExplorerState,
  store: ExplorerStore,
  callbacks: TopBarCallbacks,
): HTMLElement {
  const wrapper = el('div');

  const urlInput = el('input', {
    type: 'url',
    class: 'oui-input oui-input-mono oui-url-input',
    placeholder: 'https://services.odata.org/TripPinRESTierService',
    value: state.inputUrl,
    'aria-label': 'OData service root or $metadata URL',
  });

  const loadBtn = el(
    'button',
    {
      type: 'submit',
      class: 'oui-btn oui-btn-primary',
      disabled: state.loadingMetadata,
    },
    state.loadingMetadata ? 'Loading…' : 'Load',
  );

  const form = el('form', { class: 'oui-url-form' }, urlInput, loadBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = urlInput.value.trim();
    if (val) callbacks.onLoadUrl(val);
  });

  // Offline local file upload
  const fileInput = el('input', {
    type: 'file',
    accept: '.xml,.json,.csdl,application/xml,text/xml,application/json',
    style: 'display:none',
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        callbacks.onUploadFile(reader.result, file.name);
      }
    });
    reader.readAsText(file);
  });

  const uploadBtn = el(
    'button',
    {
      type: 'button',
      class: 'oui-btn',
      title: 'Load a local $metadata XML or JSON CSDL file offline',
    },
    'Upload $metadata',
  );
  uploadBtn.addEventListener('click', () => fileInput.click());

  const headersBtn = el(
    'button',
    {
      type: 'button',
      class: `oui-btn${state.headersDrawerOpen ? ' oui-btn-primary' : ''}`,
      title: 'Configure Bearer token or custom request headers',
    },
    state.bearerToken || state.customHeaders.some((h) => h.key.trim()) ? 'Headers ●' : 'Headers',
  );
  headersBtn.addEventListener('click', () => {
    store.setState({ headersDrawerOpen: !state.headersDrawerOpen });
  });

  const themeBtn = el(
    'button',
    {
      type: 'button',
      class: 'oui-btn',
      title: 'Toggle light / dark theme',
      'aria-label': 'Toggle theme',
    },
    state.resolvedTheme === 'dark' ? '☀ Light' : '☾ Dark',
  );
  themeBtn.addEventListener('click', () => {
    const next = state.resolvedTheme === 'dark' ? 'light' : 'dark';
    store.setState({ theme: next, resolvedTheme: next });
  });

  const versionBadge = state.model
    ? el(
        'span',
        { class: 'oui-badge oui-badge-accent', title: `Parsed as ${state.model.sourceFormat}` },
        `OData v${state.model.version}`,
      )
    : null;

  let advisorPill: HTMLElement | null = null;
  if (state.model) {
    const errs = state.diagnostics.filter((d) => d.severity === 'error').length;
    const warns = state.diagnostics.filter((d) => d.severity === 'warning').length;
    const tips = state.diagnostics.filter((d) => d.severity === 'tip').length;
    const cls =
      errs > 0
        ? 'oui-badge oui-badge-danger'
        : warns > 0
          ? 'oui-badge oui-badge-warning'
          : 'oui-badge oui-badge-tip';
    const pill = el(
      'button',
      {
        type: 'button',
        class: `oui-btn oui-btn-sm oui-btn-ghost`,
        title: 'Open Metadata Advisor diagnostics',
      },
      el('span', { class: cls }, `${errs}E · ${warns}W · ${tips} tips`),
    );
    pill.addEventListener('click', () => store.setState({ activeTab: 'advisor' }));
    advisorPill = pill;
  }

  const bar = el(
    'div',
    { class: 'oui-topbar' },
    el('span', { class: 'oui-brand' }, el('span', { class: 'oui-brand-dot' }), 'odata-ui'),
    form,
    fileInput,
    uploadBtn,
    headersBtn,
    versionBadge,
    advisorPill,
    themeBtn,
  );
  wrapper.appendChild(bar);

  if (state.headersDrawerOpen) {
    const drawer = el('div', { class: 'oui-headers-drawer' });

    const bearerInput = el('input', {
      type: 'password',
      class: 'oui-input oui-input-mono',
      style: 'flex:1; min-width:240px;',
      placeholder: 'Bearer token (optional — sent as Authorization: Bearer ...)',
      value: state.bearerToken,
    });
    bearerInput.addEventListener('input', () => {
      store.setState({ bearerToken: bearerInput.value });
    });

    const addHeaderBtn = el(
      'button',
      { type: 'button', class: 'oui-btn oui-btn-sm' },
      '+ Add Header',
    );
    addHeaderBtn.addEventListener('click', () => {
      store.setState({
        customHeaders: [...state.customHeaders, { key: '', value: '' }],
      });
    });

    drawer.appendChild(
      el(
        'div',
        { class: 'oui-headers-row' },
        el('strong', { style: 'font-size:12px; min-width:95px;' }, 'Bearer Token:'),
        bearerInput,
        addHeaderBtn,
      ),
    );

    state.customHeaders.forEach((row, idx) => {
      const kInput = el('input', {
        type: 'text',
        class: 'oui-input oui-input-mono',
        placeholder: 'Header-Name',
        value: row.key,
        style: 'width:180px;',
      });
      const vInput = el('input', {
        type: 'text',
        class: 'oui-input oui-input-mono',
        placeholder: 'Value',
        value: row.value,
        style: 'flex:1; min-width:180px;',
      });
      kInput.addEventListener('input', () => {
        const next = [...state.customHeaders];
        next[idx] = { key: kInput.value, value: vInput.value };
        store.setState({ customHeaders: next });
      });
      vInput.addEventListener('input', () => {
        const next = [...state.customHeaders];
        next[idx] = { key: kInput.value, value: vInput.value };
        store.setState({ customHeaders: next });
      });
      const rmBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '×');
      rmBtn.addEventListener('click', () => {
        store.setState({
          customHeaders: state.customHeaders.filter((_, i) => i !== idx),
        });
      });
      drawer.appendChild(el('div', { class: 'oui-headers-row' }, kInput, vInput, rmBtn));
    });

    wrapper.appendChild(drawer);
  }

  return wrapper;
}
