import {
  findComplexType,
  findEntityType,
  getAllComplexTypes,
  getAllEntityTypes,
  getEffectiveKeys,
  isEdmType,
  resolveQualifiedName,
  shortTypeName,
} from '../model/helpers.js';
import type { ODataModel } from '../model/types.js';

export interface DiagramNode {
  id: string;
  label: string;
  kind: 'entity' | 'complex';
  keys: string[];
  properties: Array<{ name: string; type: string; isKey: boolean }>;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: 'navigation' | 'contained' | 'inheritance' | 'complex';
  label: string;
  cardinality?: '1' | '*';
}

export interface DiagramGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface BuildDiagramOptions {
  focusType: string | null;
  hops: 1 | 2;
  showInheritance: boolean;
  showComplex: boolean;
}

const CARD_WIDTH = 216;
const HEADER_H = 30;
const ROW_H = 19;
const MAX_VISIBLE_PROPS = 7;

export function buildDiagramGraph(model: ODataModel, options: BuildDiagramOptions): DiagramGraph {
  const allEntities = getAllEntityTypes(model);
  const allComplex = options.showComplex ? getAllComplexTypes(model) : [];

  const allNodes = new Map<string, DiagramNode>();
  const rawEdges: DiagramEdge[] = [];

  for (const et of allEntities) {
    const keys = new Set(getEffectiveKeys(model, et));
    const props = et.properties.slice(0, MAX_VISIBLE_PROPS).map((p) => ({
      name: p.name,
      type: shortTypeName(p.type) + (p.isCollection ? '[]' : ''),
      isKey: keys.has(p.name),
    }));
    const extraCount = et.properties.length > MAX_VISIBLE_PROPS ? 1 : 0;
    const height = HEADER_H + Math.max(1, props.length + extraCount) * ROW_H + 10;

    allNodes.set(et.fullName, {
      id: et.fullName,
      label: et.name,
      kind: 'entity',
      keys: [...keys],
      properties: props,
      x: 0,
      y: 0,
      width: CARD_WIDTH,
      height,
    });
  }

  for (const ct of allComplex) {
    const props = ct.properties.slice(0, MAX_VISIBLE_PROPS).map((p) => ({
      name: p.name,
      type: shortTypeName(p.type) + (p.isCollection ? '[]' : ''),
      isKey: false,
    }));
    const extraCount = ct.properties.length > MAX_VISIBLE_PROPS ? 1 : 0;
    const height = HEADER_H + Math.max(1, props.length + extraCount) * ROW_H + 10;

    allNodes.set(ct.fullName, {
      id: ct.fullName,
      label: ct.name,
      kind: 'complex',
      keys: [],
      properties: props,
      x: 0,
      y: 0,
      width: CARD_WIDTH,
      height,
    });
  }

  for (const et of allEntities) {
    if (options.showInheritance && et.baseType) {
      const base = findEntityType(model, et.baseType, et.namespace);
      if (base && allNodes.has(base.fullName)) {
        rawEdges.push({
          id: `inh:${et.fullName}->${base.fullName}`,
          source: et.fullName,
          target: base.fullName,
          kind: 'inheritance',
          label: 'extends',
        });
      }
    }

    for (const nav of et.navigationProperties) {
      const target = findEntityType(model, nav.type, et.namespace);
      if (!target || !allNodes.has(target.fullName)) continue;
      rawEdges.push({
        id: `nav:${et.fullName}.${nav.name}->${target.fullName}`,
        source: et.fullName,
        target: target.fullName,
        kind: nav.containsTarget ? 'contained' : 'navigation',
        label: nav.name,
        cardinality: nav.isCollection ? '*' : '1',
      });
    }

    if (options.showComplex) {
      for (const prop of et.properties) {
        if (isEdmType(prop.type)) continue;
        const ct = findComplexType(model, prop.type, et.namespace);
        if (!ct || !allNodes.has(ct.fullName)) continue;
        rawEdges.push({
          id: `ct:${et.fullName}.${prop.name}->${ct.fullName}`,
          source: et.fullName,
          target: ct.fullName,
          kind: 'complex',
          label: prop.name,
          cardinality: prop.isCollection ? '*' : '1',
        });
      }
    }
  }

  // Filter down to focus neighborhood when requested
  let includedIds: Set<string>;
  if (options.focusType) {
    const resolvedFocus = allNodes.has(options.focusType)
      ? options.focusType
      : resolveQualifiedName(model, options.focusType);
    includedIds = new Set<string>();
    if (allNodes.has(resolvedFocus)) {
      includedIds.add(resolvedFocus);
      let frontier = new Set<string>([resolvedFocus]);
      for (let hop = 0; hop < options.hops; hop++) {
        const nextFrontier = new Set<string>();
        for (const edge of rawEdges) {
          if (frontier.has(edge.source) && !includedIds.has(edge.target)) {
            includedIds.add(edge.target);
            nextFrontier.add(edge.target);
          }
          if (frontier.has(edge.target) && !includedIds.has(edge.source)) {
            includedIds.add(edge.source);
            nextFrontier.add(edge.source);
          }
        }
        frontier = nextFrontier;
      }
    }
  } else {
    includedIds = new Set(allNodes.keys());
  }

  const nodes = [...allNodes.values()].filter((n) => includedIds.has(n.id));
  const edges = rawEdges.filter((e) => includedIds.has(e.source) && includedIds.has(e.target));

  runDeterministicForceLayout(nodes, edges);

  return { nodes, edges };
}

/**
 * Deterministic seeded force-directed layout + AABB anti-overlap solver.
 * Zero external dependencies, stable across renders.
 */
export function runDeterministicForceLayout(nodes: DiagramNode[], edges: DiagramEdge[]): void {
  const n = nodes.length;
  if (n === 0) return;

  if (n === 1 && nodes[0]) {
    nodes[0].x = 40;
    nodes[0].y = 40;
    return;
  }

  // Compute node degree for stable initial placement (highest-degree nodes near center)
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const ordered = nodes.toSorted(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id),
  );

  // Initial deterministic concentric placement
  const radius = Math.max(260, n * 48);
  ordered.forEach((node, idx) => {
    if (idx === 0 && n > 3) {
      node.x = 0;
      node.y = 0;
    } else {
      const angle = (2 * Math.PI * idx) / Math.max(1, n - (n > 3 ? 1 : 0));
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius * 0.78;
    }
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const idealDist = 310;
  const iterations = Math.min(180, Math.max(80, n * 14));

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;
    const fx = new Map<string, number>();
    const fy = new Map<string, number>();
    for (const node of nodes) {
      fx.set(node.id, 0);
      fy.set(node.id, 0);
    }

    // Repulsive forces
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) {
          dx = (i + 1) * 0.7;
          dy = (j + 1) * 0.5;
          dist = Math.hypot(dx, dy);
        }
        const rep = (idealDist * idealDist) / dist;
        const rx = (dx / dist) * rep * 0.16;
        const ry = (dy / dist) * rep * 0.16;
        fx.set(a.id, (fx.get(a.id) ?? 0) + rx);
        fy.set(a.id, (fy.get(a.id) ?? 0) + ry);
        fx.set(b.id, (fx.get(b.id) ?? 0) - rx);
        fy.set(b.id, (fy.get(b.id) ?? 0) - ry);
      }
    }

    // Attractive forces along edges
    for (const edge of edges) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b || a.id === b.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const targetLen = edge.kind === 'inheritance' ? 230 : idealDist;
      const pull = ((dist - targetLen) / idealDist) * 28;
      const ax = (dx / dist) * pull;
      const ay = (dy / dist) * pull;
      fx.set(a.id, (fx.get(a.id) ?? 0) + ax);
      fy.set(a.id, (fy.get(a.id) ?? 0) + ay);
      fx.set(b.id, (fx.get(b.id) ?? 0) - ax);
      fy.set(b.id, (fy.get(b.id) ?? 0) - ay);
    }

    // Gentle gravity toward origin + clamp displacement
    const maxStep = 34 * (0.2 + temp);
    for (const node of nodes) {
      const vx = (fx.get(node.id) ?? 0) - node.x * 0.015;
      const vy = (fy.get(node.id) ?? 0) - node.y * 0.015;
      const mag = Math.hypot(vx, vy);
      if (mag > 0.01) {
        const scale = Math.min(mag, maxStep) / mag;
        node.x += vx * scale;
        node.y += vy * scale;
      }
    }
  }

  // Deterministic AABB anti-overlap pass so entity cards never collide
  const padX = 48;
  const padY = 44;
  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!;
        const overlapX = (a.width + b.width) / 2 + padX - Math.abs(a.x - b.x);
        const overlapY = (a.height + b.height) / 2 + padY - Math.abs(a.y - b.y);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            const sign = a.x <= b.x ? -1 : 1;
            a.x += sign * push;
            b.x -= sign * push;
          } else {
            const push = overlapY / 2 + 1;
            const sign = a.y <= b.y ? -1 : 1;
            a.y += sign * push;
            b.y -= sign * push;
          }
        }
      }
    }
    if (!moved) break;
  }

  // Normalize top-left coordinates to positive padding
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
  }
  for (const node of nodes) {
    node.x = Math.round(node.x - node.width / 2 - minX + 48);
    node.y = Math.round(node.y - node.height / 2 - minY + 48);
  }
}
