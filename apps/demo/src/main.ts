import { ODataUI, type ODataUIInstance } from '@odata-ui/core';
import { renderDocsPage } from './docs.js';
import './style.css';

const DEFAULT_URL = 'https://services.odata.org/TripPinRESTierService';

const explorerView = document.getElementById('view-explorer') as HTMLElement;
const docsView = document.getElementById('view-docs') as HTMLElement;
const presetWrap = document.getElementById('preset-wrap') as HTMLElement;
const presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
const navExplorer = document.getElementById('nav-explorer') as HTMLAnchorElement;
const navDocs = document.getElementById('nav-docs') as HTMLAnchorElement;
const navGuide = document.getElementById('nav-guide') as HTMLAnchorElement;
const siteThemeBtn = document.getElementById('site-theme-toggle') as HTMLButtonElement;

const SUN_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

let currentTheme: 'light' | 'dark' = 'light';

function applySiteThemeUi(resolved: 'light' | 'dark'): void {
  currentTheme = resolved;
  document.documentElement.dataset.theme = resolved;
  siteThemeBtn.innerHTML = resolved === 'dark' ? SUN_SVG : MOON_SVG;
  siteThemeBtn.title = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  siteThemeBtn.setAttribute(
    'aria-label',
    resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
}

const explorer: ODataUIInstance = ODataUI({
  url: DEFAULT_URL,
  dom_id: 'explorer',
  theme: 'auto',
  onThemeChange: applySiteThemeUi,
});

siteThemeBtn.addEventListener('click', () => {
  explorer.setTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

function selectPreset(url: string): void {
  presetSelect.value = url;
  void explorer.setUrl(url);
}

presetSelect.addEventListener('change', () => {
  if (presetSelect.value) {
    selectPreset(presetSelect.value);
  }
});

function syncRoute(): void {
  const hash = window.location.hash || '#explorer';
  const isDocs = hash === '#docs';
  const isGuide = hash === '#metadata-guide';

  navExplorer.classList.toggle('active', !isDocs && !isGuide);
  navDocs.classList.toggle('active', isDocs);
  navGuide.classList.toggle('active', isGuide);

  if (isDocs || isGuide) {
    explorerView.hidden = true;
    presetWrap.hidden = true;
    siteThemeBtn.hidden = false;
    docsView.hidden = false;
    docsView.scrollTop = 0;
    docsView.innerHTML = '';
    docsView.appendChild(
      renderDocsPage(isGuide ? 'metadata-guide' : 'docs', {
        onOpenPreset: (url) => {
          window.location.hash = '#explorer';
          selectPreset(url);
        },
      }),
    );
  } else {
    docsView.hidden = true;
    explorerView.hidden = false;
    presetWrap.hidden = false;
    siteThemeBtn.hidden = true;
  }
}

window.addEventListener('hashchange', syncRoute);
syncRoute();
