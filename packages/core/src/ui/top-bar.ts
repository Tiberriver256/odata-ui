import { el } from './dom.js';
import { icon } from './icons.js';
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
    placeholder: 'Service root or /$metadata URL',
    value: state.inputUrl,
    'aria-label': 'OData service root or $metadata URL',
  });

  const loadBtn = el(
    'button',
    {
      type: 'submit',
      class: 'oui-btn oui-btn-primary oui-url-submit',
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
    icon('upload', 13),
    'Upload XML',
  );
  uploadBtn.addEventListener('click', () => fileInput.click());

  const hasCustomAuth = Boolean(
    state.bearerToken.trim() || state.customHeaders.some((h) => h.key.trim()),
  );
  const headersBtn = el(
    'button',
    {
      type: 'button',
      class: `oui-btn${state.headersDrawerOpen ? ' oui-btn-primary' : ''}`,
      title: 'Configure Bearer token or custom request headers',
    },
    icon('sliders', 13),
    hasCustomAuth ? 'Headers (on)' : 'Headers',
  );
  headersBtn.addEventListener('click', () => {
    store.setState({ headersDrawerOpen: !state.headersDrawerOpen });
  });

  const themeBtn = el(
    'button',
    {
      type: 'button',
      class: 'oui-btn oui-btn-icon',
      title: state.resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      'aria-label': 'Toggle theme',
    },
    icon(state.resolvedTheme === 'dark' ? 'sun' : 'moon', 14),
  );
  themeBtn.addEventListener('click', () => {
    const next = state.resolvedTheme === 'dark' ? 'light' : 'dark';
    store.setState({ theme: next, resolvedTheme: next });
  });

  const versionBadge = state.model
    ? el(
        'span',
        { class: 'oui-badge oui-badge-accent', title: `Parsed as ${state.model.sourceFormat}` },
        `v${state.model.version}`,
      )
    : null;

  const actions = el(
    'div',
    { class: 'oui-topbar-actions' },
    uploadBtn,
    headersBtn,
    versionBadge,
    themeBtn,
  );

  const bar = el('div', { class: 'oui-topbar' }, form, fileInput, actions);
  wrapper.appendChild(bar);

  if (state.headersDrawerOpen) {
    const drawer = el('div', { class: 'oui-headers-drawer' });

    const bearerInput = el('input', {
      type: 'password',
      class: 'oui-input oui-input-mono',
      style: 'flex:1; min-width:220px;',
      placeholder: 'Bearer token (sent as Authorization: Bearer …)',
      value: state.bearerToken,
    });
    bearerInput.addEventListener('input', () => {
      store.setState({ bearerToken: bearerInput.value });
    });

    const addHeaderBtn = el(
      'button',
      { type: 'button', class: 'oui-btn oui-btn-sm' },
      icon('plus', 12),
      'Header',
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
        el('strong', { style: 'font-size:12px; min-width:88px;' }, 'Bearer token'),
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
        style: 'width:170px;',
      });
      const vInput = el('input', {
        type: 'text',
        class: 'oui-input oui-input-mono',
        placeholder: 'Value',
        value: row.value,
        style: 'flex:1; min-width:160px;',
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
      const rmBtn = el(
        'button',
        { type: 'button', class: 'oui-btn oui-btn-sm', 'aria-label': 'Remove header' },
        icon('x', 12),
      );
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
