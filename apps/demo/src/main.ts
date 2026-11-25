import { ODataUI, type ODataUIInstance } from '@odata-ui/core';
import { renderDocsPage } from './docs.js';
import './style.css';

const DEFAULT_URL = 'https://services.odata.org/TripPinRESTierService';

const explorerView = document.getElementById('view-explorer') as HTMLElement;
const docsView = document.getElementById('view-docs') as HTMLElement;
const presetBar = document.getElementById('preset-bar') as HTMLElement;
const navExplorer = document.getElementById('nav-explorer') as HTMLAnchorElement;
const navDocs = document.getElementById('nav-docs') as HTMLAnchorElement;
const navGuide = document.getElementById('nav-guide') as HTMLAnchorElement;
const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.preset-btn'));

const explorer: ODataUIInstance = ODataUI({
  url: DEFAULT_URL,
  dom_id: 'explorer',
  theme: 'auto',
});

function selectPreset(url: string): void {
  for (const btn of presetButtons) {
    btn.classList.toggle('active', btn.dataset.url === url);
  }
  void explorer.setUrl(url);
}

for (const btn of presetButtons) {
  btn.addEventListener('click', () => {
    const url = btn.dataset.url;
    if (url) selectPreset(url);
  });
}

function syncRoute(): void {
  const hash = window.location.hash || '#explorer';
  const isDocs = hash === '#docs';
  const isGuide = hash === '#metadata-guide';

  navExplorer.classList.toggle('active', !isDocs && !isGuide);
  navDocs.classList.toggle('active', isDocs);
  navGuide.classList.toggle('active', isGuide);

  if (isDocs || isGuide) {
    explorerView.hidden = true;
    presetBar.hidden = true;
    docsView.hidden = false;
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
    presetBar.hidden = false;
  }
}

window.addEventListener('hashchange', syncRoute);
syncRoute();
