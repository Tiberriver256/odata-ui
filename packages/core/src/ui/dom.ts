export type DomChild = Node | string | number | false | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | boolean | number | undefined | null>,
  ...children: DomChild[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  appendChildren(node, children);
  return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | undefined>,
  ...children: DomChild[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined) continue;
      node.setAttribute(k, String(v));
    }
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(parent: Node, children: DomChild[]): void {
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }
}

export function clear(node: Element): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function renderHighlightedJson(value: unknown): HTMLElement {
  const pre = el('pre', { class: 'oui-pre oui-json-view' });
  const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!json) {
    pre.textContent = 'null';
    return pre;
  }

  // Tokenize JSON safely into text spans without using innerHTML
  const tokenRegex =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      pre.appendChild(document.createTextNode(json.slice(lastIndex, match.index)));
    }
    const token = match[0];
    let cls = 'oui-json-num';
    if (token.startsWith('"')) {
      cls = token.endsWith(':') ? 'oui-json-key' : 'oui-json-str';
    } else if (token === 'true' || token === 'false') {
      cls = 'oui-json-bool';
    } else if (token === 'null') {
      cls = 'oui-json-null';
    }
    pre.appendChild(el('span', { class: cls }, token));
    lastIndex = match.index + token.length;
  }

  if (lastIndex < json.length) {
    pre.appendChild(document.createTextNode(json.slice(lastIndex)));
  }

  return pre;
}
