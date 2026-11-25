export function childElements(parent: Element, localName?: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children.item(i);
    if (!child) continue;
    if (!localName || child.localName === localName) {
      out.push(child);
    }
  }
  return out;
}

export function firstChildElement(parent: Element, localName: string): Element | undefined {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children.item(i);
    if (child && child.localName === localName) return child;
  }
  return undefined;
}

export function attr(el: Element, name: string): string | undefined {
  const direct = el.getAttribute(name);
  if (direct !== null) return direct;
  // Also match namespaced attributes by localName (e.g., m:DataServiceVersion)
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i);
    if (a && a.localName === name) return a.value;
  }
  return undefined;
}

export function boolAttr(el: Element, name: string, defaultValue: boolean): boolean {
  const val = attr(el, name);
  if (val === undefined) return defaultValue;
  return val.toLowerCase() === 'true';
}

export function intAttr(el: Element, name: string): number | undefined {
  const val = attr(el, name);
  if (val === undefined || val === 'Max' || val === 'max') return undefined;
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function scaleAttr(el: Element, name: string): number | 'variable' | undefined {
  const val = attr(el, name);
  if (val === undefined) return undefined;
  if (val.toLowerCase() === 'variable') return 'variable';
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
