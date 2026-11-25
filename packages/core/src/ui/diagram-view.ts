import { findEntitySet, findSingleton, getAllEntityTypes } from '../model/helpers.js';
import {
  buildDiagramGraph,
  type DiagramEdge,
  type DiagramGraph,
  type DiagramNode,
} from './diagram-layout.js';
import { el, svgEl } from './dom.js';
import type { ExplorerState, ExplorerStore } from './store.js';

interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
  initialized: boolean;
}

interface CachedDiagramSession {
  key: string;
  graph: DiagramGraph;
  camera: CameraState;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4.0;

// Persist layout positions and camera across selection clicks so panning/zooming never snaps back
let cachedSession: CachedDiagramSession | null = null;
// Persist last tap across re-renders so double-click / double-tap works even when the first tap triggers a selection re-render
let lastTapNodeId: string | null = null;
let lastTapTime = 0;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function anchorPoint(
  node: DiagramNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = node.width / 2;
  const hh = node.height / 2;
  const scale = Math.min(
    Math.abs(dx) > 0.001 ? hw / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.001 ? hh / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

interface EdgeLayoutInfo {
  curveOffset: number;
  labelT: number;
  selfLoopIndex: number;
}

function edgePathData(
  edge: DiagramEdge,
  src: DiagramNode,
  dst: DiagramNode,
  layout: EdgeLayoutInfo,
): { d: string; labelX: number; labelY: number } {
  if (src.id === dst.id) {
    // Route each self-loop to a distinct corner of the card so labels never overlap
    const slot = layout.selfLoopIndex % 4;
    const tier = Math.floor(layout.selfLoopIndex / 4);
    const loopSize = 46 + tier * 34;

    if (slot === 0) {
      // Top-right corner loop
      const sx = src.x + src.width - 24;
      const sy = src.y;
      const ex = src.x + src.width;
      const ey = src.y + 24;
      const c1x = sx + 6;
      const c1y = sy - loopSize;
      const c2x = ex + loopSize + 8;
      const c2y = ey - 6;
      const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      return {
        d,
        labelX: src.x + src.width + 26 + tier * 20,
        labelY: src.y - 22 - tier * 18,
      };
    }

    if (slot === 1) {
      // Bottom-right corner loop
      const sx = src.x + src.width;
      const sy = src.y + src.height - 24;
      const ex = src.x + src.width - 24;
      const ey = src.y + src.height;
      const c1x = sx + loopSize + 8;
      const c1y = sy + 6;
      const c2x = ex + 6;
      const c2y = ey + loopSize;
      const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      return {
        d,
        labelX: src.x + src.width + 26 + tier * 20,
        labelY: src.y + src.height + 28 + tier * 18,
      };
    }

    if (slot === 2) {
      // Top-left corner loop
      const sx = src.x + 24;
      const sy = src.y;
      const ex = src.x;
      const ey = src.y + 24;
      const c1x = sx - 6;
      const c1y = sy - loopSize;
      const c2x = ex - loopSize - 8;
      const c2y = ey - 6;
      const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      return {
        d,
        labelX: src.x - 26 - tier * 20,
        labelY: src.y - 22 - tier * 18,
      };
    }

    // Bottom-left corner loop
    const sx = src.x;
    const sy = src.y + src.height - 24;
    const ex = src.x + 24;
    const ey = src.y + src.height;
    const c1x = sx - loopSize - 8;
    const c1y = sy + 6;
    const c2x = ex - 6;
    const c2y = ey + loopSize;
    const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    return {
      d,
      labelX: src.x - 26 - tier * 20,
      labelY: src.y + src.height + 28 + tier * 18,
    };
  }

  const scx = src.x + src.width / 2;
  const scy = src.y + src.height / 2;
  const dcx = dst.x + dst.width / 2;
  const dcy = dst.y + dst.height / 2;

  const start = anchorPoint(src, dcx, dcy);
  const end = anchorPoint(dst, scx, scy);

  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(1, Math.hypot(dx, dy));

  // Canonicalize perpendicular normal direction by sorted endpoint IDs so opposite-direction parallel edges always bow to opposite sides
  const canonicalSign = edge.source < edge.target ? 1 : -1;
  const nx = (-dy / len) * layout.curveOffset * canonicalSign;
  const ny = (dx / len) * layout.curveOffset * canonicalSign;

  const cx = mx + nx;
  const cy = my + ny;
  const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;

  // Evaluate quadratic Bezier at staggered parametric t so parallel labels never collide
  const t = layout.labelT;
  const mt = 1 - t;
  const labelX = mt * mt * start.x + 2 * mt * t * cx + t * t * end.x;
  const labelY = mt * mt * start.y + 2 * mt * t * cy + t * t * end.y;
  return { d, labelX, labelY };
}

function getGraphBounds(nodes: DiagramNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

function resolveSelectedTypeId(state: ExplorerState): string | null {
  if (!state.selected || !state.model) return null;
  if (state.selected.kind === 'entityType' || state.selected.kind === 'complexType') {
    return state.selected.id;
  }
  if (state.selected.kind === 'entitySet') {
    return findEntitySet(state.model, state.selected.id)?.entityType ?? null;
  }
  if (state.selected.kind === 'singleton') {
    return findSingleton(state.model, state.selected.id)?.type ?? null;
  }
  return null;
}

function pickPrimaryNode(graph: DiagramGraph, selectedTypeId: string | null): DiagramNode {
  if (selectedTypeId) {
    const match = graph.nodes.find((n) => n.id === selectedTypeId);
    if (match) return match;
  }
  // Pick the highest-degree node (most connected entity) so 100% zoom always frames meaningful content
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  let best = graph.nodes[0]!;
  let bestDeg = -1;
  for (const n of graph.nodes) {
    const d = degree.get(n.id) ?? 0;
    if (d > bestDeg) {
      bestDeg = d;
      best = n;
    }
  }
  return best;
}

export function renderDiagramView(state: ExplorerState, store: ExplorerStore): HTMLElement {
  const container = el('div', { class: 'oui-diagram-container' });

  if (!state.model) {
    container.appendChild(
      el('div', { class: 'oui-empty' }, 'Load an OData service to view its relationship diagram.'),
    );
    return container;
  }

  const model = state.model;
  const allEntities = getAllEntityTypes(model);
  const selectedTypeId = resolveSelectedTypeId(state);

  const sessionKey = [
    state.serviceRoot,
    model.version,
    allEntities.length,
    state.diagramFocusType ?? '*',
    state.diagramHops,
    state.diagramShowInheritance ? '1' : '0',
    state.diagramShowComplex ? '1' : '0',
  ].join('|');

  let session: CachedDiagramSession;
  if (cachedSession && cachedSession.key === sessionKey) {
    session = cachedSession;
  } else {
    const graph = buildDiagramGraph(model, {
      focusType: state.diagramFocusType,
      hops: state.diagramHops,
      showInheritance: state.diagramShowInheritance,
      showComplex: state.diagramShowComplex,
    });
    session = {
      key: sessionKey,
      graph,
      camera: { panX: 0, panY: 0, zoom: 1, initialized: false },
    };
    cachedSession = session;
  }

  const { graph, camera } = session;

  // Focus selector
  const focusSelect = el('select', { class: 'oui-select', 'aria-label': 'Focus entity type' });
  focusSelect.appendChild(el('option', { value: '' }, `All types (${allEntities.length})`));
  for (const et of allEntities) {
    focusSelect.appendChild(
      el(
        'option',
        { value: et.fullName, selected: state.diagramFocusType === et.fullName },
        et.name,
      ),
    );
  }
  focusSelect.addEventListener('change', () => {
    store.setState({ diagramFocusType: focusSelect.value || null });
  });

  const hopsSelect = el(
    'select',
    {
      class: 'oui-select',
      disabled: !state.diagramFocusType,
      title: 'Neighborhood depth around focused entity',
      'aria-label': 'Neighborhood hop depth',
    },
    el('option', { value: '1', selected: state.diagramHops === 1 }, '1-hop'),
    el('option', { value: '2', selected: state.diagramHops === 2 }, '2-hop'),
  );
  hopsSelect.addEventListener('change', () => {
    store.setState({ diagramHops: hopsSelect.value === '2' ? 2 : 1 });
  });

  const inheritCb = el('input', { type: 'checkbox', checked: state.diagramShowInheritance });
  inheritCb.addEventListener('change', () => {
    store.setState({ diagramShowInheritance: inheritCb.checked });
  });

  const complexCb = el('input', { type: 'checkbox', checked: state.diagramShowComplex });
  complexCb.addEventListener('change', () => {
    store.setState({ diagramShowComplex: complexCb.checked });
  });

  const zoomOutBtn = el(
    'button',
    { type: 'button', class: 'oui-btn oui-btn-sm', title: 'Zoom out', 'aria-label': 'Zoom out' },
    '−',
  );
  const zoomResetBtn = el(
    'button',
    {
      type: 'button',
      class: 'oui-btn oui-btn-sm',
      title: 'Zoom to 100% readable size centered on primary entity',
    },
    '100%',
  );
  const zoomInBtn = el(
    'button',
    { type: 'button', class: 'oui-btn oui-btn-sm', title: 'Zoom in', 'aria-label': 'Zoom in' },
    '+',
  );
  const fitBtn = el(
    'button',
    { type: 'button', class: 'oui-btn oui-btn-sm', title: 'Fit all entities into view' },
    'Fit',
  );

  const zoomBar = el(
    'div',
    { class: 'oui-diagram-zoom-bar' },
    zoomOutBtn,
    zoomResetBtn,
    zoomInBtn,
    fitBtn,
  );

  const toolbar = el(
    'div',
    { class: 'oui-diagram-toolbar' },
    focusSelect,
    hopsSelect,
    el(
      'label',
      {
        style: 'display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-size:12px;',
      },
      inheritCb,
      'Inheritance',
    ),
    el(
      'label',
      {
        style: 'display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-size:12px;',
      },
      complexCb,
      'Complex',
    ),
    zoomBar,
  );
  container.appendChild(toolbar);

  const stage = el('div', { class: 'oui-diagram-stage' });
  container.appendChild(stage);

  if (graph.nodes.length === 0) {
    stage.appendChild(
      el('div', { class: 'oui-empty' }, 'No entity types to display for the current filter.'),
    );
    return container;
  }

  // Operate directly in 1:1 CSS screen pixels (no cramped fixed viewBox)
  const svg = svgEl('svg', { class: 'oui-diagram-svg' });

  const defs = svgEl(
    'defs',
    {},
    svgEl(
      'marker',
      {
        id: 'oui-arrow-nav',
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: 'auto-start-reverse',
      },
      svgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: 'var(--odata-ui-nav)' }),
    ),
    svgEl(
      'marker',
      {
        id: 'oui-arrow-contained',
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: 'auto-start-reverse',
      },
      svgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: 'var(--odata-ui-warning)' }),
    ),
    svgEl(
      'marker',
      {
        id: 'oui-arrow-inherit',
        viewBox: '0 0 12 12',
        refX: 11,
        refY: 6,
        markerWidth: 9,
        markerHeight: 9,
        orient: 'auto-start-reverse',
      },
      svgEl('path', {
        d: 'M 1 1 L 11 6 L 1 11 z',
        fill: 'var(--odata-ui-bg)',
        stroke: 'var(--odata-ui-text-muted)',
        'stroke-width': 1.4,
      }),
    ),
  );
  svg.appendChild(defs);

  const viewport = svgEl('g');
  const edgesLayer = svgEl('g');
  const nodesLayer = svgEl('g');
  viewport.appendChild(edgesLayer);
  viewport.appendChild(nodesLayer);
  svg.appendChild(viewport);

  const applyCamera = () => {
    viewport.setAttribute(
      'transform',
      `translate(${camera.panX.toFixed(3)}, ${camera.panY.toFixed(3)}) scale(${camera.zoom.toFixed(5)})`,
    );
    zoomResetBtn.textContent = `${Math.round(camera.zoom * 100)}%`;
  };

  const getStageSize = () => {
    const rect = svg.getBoundingClientRect();
    return {
      width: rect.width > 10 ? rect.width : 800,
      height: rect.height > 10 ? rect.height : 520,
    };
  };

  const zoomAtPoint = (nextZoom: number, screenX: number, screenY: number) => {
    const clamped = clampZoom(nextZoom);
    const ratio = clamped / camera.zoom;
    camera.panX = screenX - (screenX - camera.panX) * ratio;
    camera.panY = screenY - (screenY - camera.panY) * ratio;
    camera.zoom = clamped;
    applyCamera();
  };

  const fitToView = (preferReadableOnMobile = false) => {
    const { width, height } = getStageSize();
    const bounds = getGraphBounds(graph.nodes);
    const graphW = Math.max(1, bounds.maxX - bounds.minX);
    const graphH = Math.max(1, bounds.maxY - bounds.minY);
    const pad = 36;
    const fitZoom = clampZoom(
      Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH, 1.15),
    );
    // On narrow phones, avoid starting microscopic (<0.55x) — center on the primary/selected node at 0.85x so it's immediately readable & draggable
    if (preferReadableOnMobile && width < 560 && fitZoom < 0.55) {
      const targetNode = pickPrimaryNode(graph, selectedTypeId);
      camera.zoom = 0.85;
      camera.panX = width / 2 - (targetNode.x + targetNode.width / 2) * camera.zoom;
      camera.panY = height / 2 - (targetNode.y + targetNode.height / 2) * camera.zoom;
    } else {
      camera.zoom = fitZoom;
      const gcx = (bounds.minX + bounds.maxX) / 2;
      const gcy = (bounds.minY + bounds.maxY) / 2;
      camera.panX = width / 2 - gcx * camera.zoom;
      camera.panY = height / 2 - gcy * camera.zoom;
    }
    camera.initialized = true;
    applyCamera();
  };

  const centerAt100 = () => {
    const { width, height } = getStageSize();
    const targetNode = pickPrimaryNode(graph, selectedTypeId);
    camera.zoom = 1;
    camera.panX = width / 2 - (targetNode.x + targetNode.width / 2);
    camera.panY = height / 2 - (targetNode.y + targetNode.height / 2);
    applyCamera();
  };

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Precompute symmetric curve offsets & staggered label positions for parallel edges and self-loops
  const pairGroups = new Map<string, DiagramEdge[]>();
  const selfLoopCounts = new Map<string, number>();
  const edgeLayoutMap = new Map<string, EdgeLayoutInfo>();

  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      const idx = selfLoopCounts.get(edge.source) ?? 0;
      selfLoopCounts.set(edge.source, idx + 1);
      edgeLayoutMap.set(edge.id, { curveOffset: 0, labelT: 0.5, selfLoopIndex: idx });
    } else {
      const pairKey = [edge.source, edge.target].toSorted().join('<->');
      const list = pairGroups.get(pairKey) ?? [];
      list.push(edge);
      pairGroups.set(pairKey, list);
    }
  }

  for (const group of pairGroups.values()) {
    const total = group.length;
    group.forEach((edge, idx) => {
      if (total === 1) {
        edgeLayoutMap.set(edge.id, { curveOffset: 10, labelT: 0.5, selfLoopIndex: 0 });
      } else {
        const centeredIdx = idx - (total - 1) / 2;
        const curveOffset = centeredIdx * 66;
        // Stagger parametric t along the curve so parallel edge labels separate cleanly
        const labelT =
          total === 2 ? (idx === 0 ? 0.35 : 0.65) : 0.28 + (idx / Math.max(1, total - 1)) * 0.44;
        edgeLayoutMap.set(edge.id, { curveOffset, labelT, selfLoopIndex: 0 });
      }
    });
  }

  const edgeDom = new Map<
    string,
    { path: SVGPathElement; label: SVGTextElement; textLength: number; x: number; y: number }
  >();

  // Deterministic 2D AABB de-overlap pass guarantees zero colliding edge labels at any angle
  const resolveLabelCollisions = () => {
    const entries = [...edgeDom.values()];
    const labelH = 18;
    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (let i = 0; i < entries.length; i++) {
        const a = entries[i]!;
        const aw = a.textLength * 7.2 + 16;
        for (let j = i + 1; j < entries.length; j++) {
          const b = entries[j]!;
          const bw = b.textLength * 7.2 + 16;
          const dx = Math.abs(a.x - b.x);
          const dy = Math.abs(a.y - b.y);
          const minSepX = (aw + bw) / 2;
          const minSepY = labelH;
          if (dx < minSepX && dy < minSepY) {
            const pushY = (minSepY - dy) / 2 + 2;
            const dir = a.y <= b.y ? -1 : 1;
            a.y += dir * pushY;
            b.y -= dir * pushY;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const entry of entries) {
      entry.label.setAttribute('x', entry.x.toFixed(1));
      entry.label.setAttribute('y', entry.y.toFixed(1));
    }
  };

  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.source);
    const dst = nodeMap.get(edge.target);
    if (!src || !dst) continue;
    const layout = edgeLayoutMap.get(edge.id) ?? { curveOffset: 10, labelT: 0.5, selfLoopIndex: 0 };
    const { d, labelX, labelY } = edgePathData(edge, src, dst, layout);

    const cls =
      edge.kind === 'inheritance'
        ? 'oui-diagram-edge-inherit'
        : edge.kind === 'contained'
          ? 'oui-diagram-edge-contained'
          : 'oui-diagram-edge-nav';
    const marker =
      edge.kind === 'inheritance'
        ? 'url(#oui-arrow-inherit)'
        : edge.kind === 'contained'
          ? 'url(#oui-arrow-contained)'
          : 'url(#oui-arrow-nav)';

    const path = svgEl('path', { d, class: cls, 'marker-end': marker });
    const textLabel = edge.cardinality ? `${edge.label} [${edge.cardinality}]` : edge.label;
    const label = svgEl(
      'text',
      {
        x: labelX.toFixed(1),
        y: labelY.toFixed(1),
        'text-anchor': 'middle',
        class: 'oui-diagram-edge-label',
      },
      textLabel,
    );

    edgesLayer.appendChild(path);
    edgesLayer.appendChild(label);
    edgeDom.set(edge.id, { path, label, textLength: textLabel.length, x: labelX, y: labelY });
  }

  resolveLabelCollisions();

  const rerouteConnectedEdges = (nodeId: string) => {
    for (const edge of graph.edges) {
      if (edge.source !== nodeId && edge.target !== nodeId) continue;
      const src = nodeMap.get(edge.source);
      const dst = nodeMap.get(edge.target);
      const dom = edgeDom.get(edge.id);
      if (!src || !dst || !dom) continue;
      const layout = edgeLayoutMap.get(edge.id) ?? {
        curveOffset: 10,
        labelT: 0.5,
        selfLoopIndex: 0,
      };
      const { d, labelX, labelY } = edgePathData(edge, src, dst, layout);
      dom.path.setAttribute('d', d);
      dom.x = labelX;
      dom.y = labelY;
    }
    resolveLabelCollisions();
  };

  // Multi-pointer pan, card drag, tap/click + double-click, and two-finger pinch-to-zoom
  const activePointers = new Map<number, { x: number; y: number }>();
  let draggingNode: {
    pointerId: number;
    node: DiagramNode;
    group: SVGGElement;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null = null;
  let panning: {
    pointerId: number;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null = null;
  let pinchState: {
    dist: number;
    midX: number;
    midY: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
  } | null = null;

  const beginPinch = () => {
    const pts = [...activePointers.values()];
    if (pts.length < 2 || !pts[0] || !pts[1]) return;
    const rect = svg.getBoundingClientRect();
    const p1 = pts[0];
    const p2 = pts[1];
    pinchState = {
      dist: Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
      midX: (p1.x + p2.x) / 2 - rect.left,
      midY: (p1.y + p2.y) / 2 - rect.top,
      startZoom: camera.zoom,
      startPanX: camera.panX,
      startPanY: camera.panY,
    };
    draggingNode = null;
    panning = null;
  };

  for (const node of graph.nodes) {
    const isSelected = selectedTypeId === node.id;
    const g = svgEl('g', {
      class: `oui-diagram-card${isSelected ? ' selected' : ''}`,
      transform: `translate(${node.x}, ${node.y})`,
      'data-node-id': node.id,
    });

    g.appendChild(
      svgEl('rect', { class: 'card-bg', width: node.width, height: node.height, rx: 7, ry: 7 }),
    );
    g.appendChild(
      svgEl('rect', { class: 'card-head', width: node.width, height: 30, rx: 7, ry: 7 }),
    );
    g.appendChild(
      svgEl('line', {
        x1: 0,
        y1: 30,
        x2: node.width,
        y2: 30,
        stroke: 'var(--odata-ui-border)',
        'stroke-width': 1,
      }),
    );
    g.appendChild(
      svgEl(
        'text',
        { x: 10, y: 20, 'font-weight': '700', 'font-size': 12.5, fill: 'var(--odata-ui-text)' },
        node.kind === 'complex' ? `«complex» ${node.label}` : node.label,
      ),
    );

    node.properties.forEach((p, idx) => {
      const py = 47 + idx * 19;
      const prefix = p.isKey ? 'PK ' : '';
      g.appendChild(
        svgEl(
          'text',
          {
            x: 10,
            y: py,
            'font-size': 11.5,
            'font-weight': p.isKey ? '600' : '400',
            fill: p.isKey ? 'var(--odata-ui-key)' : 'var(--odata-ui-text-secondary)',
          },
          `${prefix}${p.name}`,
        ),
      );
      g.appendChild(
        svgEl(
          'text',
          {
            x: node.width - 10,
            y: py,
            'text-anchor': 'end',
            'font-size': 10.5,
            'font-family': 'var(--odata-ui-font-mono)',
            fill: 'var(--odata-ui-text-muted)',
          },
          p.type.length > 14 ? `${p.type.slice(0, 13)}…` : p.type,
        ),
      );
    });

    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.stopPropagation();
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic events
      }
      if (activePointers.size >= 2) {
        beginPinch();
        return;
      }
      draggingNode = {
        pointerId: e.pointerId,
        node,
        group: g,
        startX: e.clientX,
        startY: e.clientY,
        origX: node.x,
        origY: node.y,
        moved: false,
      };
    });

    nodesLayer.appendChild(g);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic events
    }
    if (activePointers.size >= 2) {
      beginPinch();
      return;
    }
    panning = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: camera.panX,
      origPanY: camera.panY,
    };
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchState && activePointers.size >= 2) {
      const pts = [...activePointers.values()];
      const p1 = pts[0];
      const p2 = pts[1];
      if (!p1 || !p2) return;
      const rect = svg.getBoundingClientRect();
      const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const midX = (p1.x + p2.x) / 2 - rect.left;
      const midY = (p1.y + p2.y) / 2 - rect.top;

      const nextZoom = clampZoom(pinchState.startZoom * (dist / pinchState.dist));
      const worldX = (pinchState.midX - pinchState.startPanX) / pinchState.startZoom;
      const worldY = (pinchState.midY - pinchState.startPanY) / pinchState.startZoom;
      camera.zoom = nextZoom;
      camera.panX = midX - worldX * nextZoom;
      camera.panY = midY - worldY * nextZoom;
      applyCamera();
      return;
    }

    if (draggingNode && draggingNode.pointerId === e.pointerId) {
      const dx = (e.clientX - draggingNode.startX) / camera.zoom;
      const dy = (e.clientY - draggingNode.startY) / camera.zoom;
      if (Math.hypot(e.clientX - draggingNode.startX, e.clientY - draggingNode.startY) > 5) {
        draggingNode.moved = true;
      }
      if (draggingNode.moved) {
        draggingNode.node.x = draggingNode.origX + dx;
        draggingNode.node.y = draggingNode.origY + dy;
        draggingNode.group.setAttribute(
          'transform',
          `translate(${draggingNode.node.x.toFixed(1)}, ${draggingNode.node.y.toFixed(1)})`,
        );
        rerouteConnectedEdges(draggingNode.node.id);
      }
    } else if (panning && panning.pointerId === e.pointerId) {
      camera.panX = panning.origPanX + (e.clientX - panning.startX);
      camera.panY = panning.origPanY + (e.clientY - panning.startY);
      applyCamera();
    }
  });

  const endPointer = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (draggingNode?.pointerId === e.pointerId) {
      const finished = draggingNode;
      draggingNode = null;
      if (!finished.moved && e.type === 'pointerup') {
        const now = Date.now();
        if (lastTapNodeId === finished.node.id && now - lastTapTime < 380) {
          lastTapNodeId = null;
          lastTapTime = 0;
          if (finished.node.kind === 'entity') {
            store.setState({
              selected: { kind: 'entityType', id: finished.node.id },
              diagramFocusType: finished.node.id,
            });
          }
        } else {
          lastTapNodeId = finished.node.id;
          lastTapTime = now;
          store.setState({
            selected: {
              kind: finished.node.kind === 'complex' ? 'complexType' : 'entityType',
              id: finished.node.id,
            },
          });
        }
      }
    }
    if (panning?.pointerId === e.pointerId) {
      panning = null;
      svg.classList.remove('panning');
    }
    if (activePointers.size < 2) {
      pinchState = null;
    }
    if (activePointers.size === 1) {
      // Smooth handoff from 2-finger pinch back to 1-finger pan
      const entry = activePointers.entries().next().value;
      if (entry) {
        const [pid, pt] = entry;
        panning = {
          pointerId: pid,
          startX: pt.x,
          startY: pt.y,
          origPanX: camera.panX,
          origPanY: camera.panY,
        };
      }
    }
  };

  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16;
      zoomAtPoint(camera.zoom * factor, mx, my);
    },
    { passive: false },
  );

  zoomInBtn.addEventListener('click', () => {
    const { width, height } = getStageSize();
    zoomAtPoint(camera.zoom * 1.35, width / 2, height / 2);
  });
  zoomOutBtn.addEventListener('click', () => {
    const { width, height } = getStageSize();
    zoomAtPoint(camera.zoom / 1.35, width / 2, height / 2);
  });
  zoomResetBtn.addEventListener('click', centerAt100);
  fitBtn.addEventListener('click', () => fitToView(false));

  stage.appendChild(svg);

  // Run initial camera fit after layout paint so getBoundingClientRect() has real dimensions
  if (camera.initialized) {
    applyCamera();
  } else {
    requestAnimationFrame(() => {
      if (svg.isConnected) {
        fitToView(true);
      }
    });
  }

  return container;
}
