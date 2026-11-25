import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ODataUI } from '../src/index.js';

const trippinXml = readFileSync(
  resolve(import.meta.dirname, 'fixtures/trippin-restier.xml'),
  'utf8',
);

describe('ODataUI mount & Shadow DOM UI', () => {
  it('mounts into Shadow DOM, renders metadata tree, details, diagram, query builder, and advisor, then unmounts cleanly', () => {
    const host = document.createElement('div');
    host.id = 'explorer';
    document.body.appendChild(host);

    const instance = ODataUI({
      dom_id: 'explorer',
      metadata: trippinXml,
      url: 'https://services.odata.org/TripPinRESTierService',
      theme: 'light',
    });

    const shadow = host.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow?.querySelector('.oui-topbar')).not.toBeNull();
    expect(shadow?.textContent).toContain('People');
    expect(shadow?.textContent).toContain('v4.0');

    // Switch to Diagram tab
    const tabs = Array.from(shadow!.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const diagramTab = tabs.find((t) => t.textContent?.includes('Diagram'));
    diagramTab?.click();
    expect(shadow?.querySelector('svg.oui-diagram-svg')).not.toBeNull();

    // Switch to Query tab
    const queryTab = Array.from(shadow!.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (t) => t.textContent?.includes('Query'),
    );
    queryTab?.click();
    const urlInput = shadow?.querySelector<HTMLInputElement>(
      'input[aria-label="Generated OData query URL"]',
    );
    expect(urlInput?.value).toContain('/People?');

    // Switch to Advisor tab
    const advisorTab = Array.from(shadow!.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (t) => t.textContent?.includes('Advisor'),
    );
    advisorTab?.click();
    expect(shadow?.textContent).toContain('OData Metadata Advisor');

    instance.unmount();
    expect(shadow?.children.length).toBe(0);
    host.remove();
  });
});
