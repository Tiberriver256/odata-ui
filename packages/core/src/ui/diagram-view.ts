import { getAllEntityTypes } from '../model/helpers.js';
import { buildDiagramGraph, type DiagramEdge, type DiagramNode } from './diagram-layout.js';
import { el, svgEl } from './dom.js';
import type { ExplorerState, ExplorerStore } from './store.js';

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

function edgePathData(
  edge: DiagramEdge,
  src: DiagramNode,
  dst: DiagramNode,
  curveOffset: number,
): { d: string; labelX: number; labelY: number } {
  if (src.id === dst.id) {
    // Self-loop above top-right corner
    const sx = src.x + src.width - 24;
    const sy = src.y;
    const ex = src.x + src.width;
    const ey = src.y + 24;
    const d = `M ${sx} ${sy} C ${sx + 10} ${sy - 46}, ${ex + 46} ${ey - 10}, ${ex} ${ey}`;
    return { d, labelX: ex + 26, labelY: sy - 20 };
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
  const nx = (-dy / len) * curveOffset;
  const ny = (dx / len) * curveOffset;

  const cx = mx + nx;
  const cy = my + ny;
  const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  return { d, labelX: (start.x + 2 * cx + end.x) / 4, labelY: (start.y + 2 * cy + end.y) / 4 };
}

export function renderDiagramView(state: ExplorerState, store: ExplorerStore): HTMLElement {
  const container = el('div', {
    style: 'display:flex; flex-direction:column; flex:1; min-height:0;',
  });

  if (!state.model) {
    container.appendChild(
      el('div', { class: 'oui-empty' }, 'Load an OData service to view its relationship diagram.'),
    );
    return container;
  }

  const model = state.model;
  const allEntities = getAllEntityTypes(model);

  // Focus selector (day-one scalability filter)
  const focusSelect = el('select', { class: 'oui-select', 'aria-label': 'Focus entity type' });
  focusSelect.appendChild(el('option', { value: '' }, `All entity types (${allEntities.length})`));
  for (const et of allEntities) {
    const opt = el(
      'option',
      { value: et.fullName, selected: state.diagramFocusType === et.fullName },
      et.name,
    );
    focusSelect.appendChild(opt);
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
    },
    el('option', { value: '1', selected: state.diagramHops === 1 }, '1-hop neighbors'),
    el('option', { value: '2', selected: state.diagramHops === 2 }, '2-hop neighbors'),
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

  const zoomInBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '+');
  const zoomOutBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, '−');
  const fitBtn = el('button', { type: 'button', class: 'oui-btn oui-btn-sm' }, 'Fit');

  const graph = buildDiagramGraph(model, {
    focusType: state.diagramFocusType,
    hops: state.diagramHops,
    showInheritance: state.diagramShowInheritance,
    showComplex: state.diagramShowComplex,
  });

  const toolbar = el(
    'div',
    { class: 'oui-diagram-toolbar' },
    el(
      'label',
      { style: 'display:inline-flex; align-items:center; gap:5px; font-weight:600;' },
      'Focus:',
      focusSelect,
    ),
    hopsSelect,
    el(
      'label',
      { style: 'display:inline-flex; align-items:center; gap:4px; cursor:pointer;' },
      inheritCb,
      'Inheritance',
    ),
    el(
      'label',
      { style: 'display:inline-flex; align-items:center; gap:4px; cursor:pointer;' },
      complexCb,
      'Complex types',
    ),
    el('span', { class: 'oui-badge' }, `${graph.nodes.length} types · ${graph.edges.length} edges`),
    el('div', { style: 'margin-left:auto; display:flex; gap:4px;' }, zoomOutBtn, fitBtn, zoomInBtn),
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

  // Compute bounding box for initial viewBox
  let maxX = 800;
  let maxY = 520;
  for (const n of graph.nodes) {
    maxX = Math.max(maxX, n.x + n.width + 64);
    maxY = Math.max(maxY, n.y + n.height + 64);
  }

  let panX = 0;
  let panY = 0;
  let zoom = 1;

  const svg = svgEl('svg', {
    class: 'oui-diagram-svg',
    viewBox: `0 0 ${maxX} ${maxY}`,
  });

  // Markers for navigation arrows and UML inheritance triangle
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

  const applyTransform = () => {
    viewport.setAttribute(
      'transform',
      `translate(${panX.toFixed(1)}, ${panY.toFixed(1)}) scale(${zoom.toFixed(3)})`,
    );
  };

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Precompute curve offsets for parallel edges between the same node pair
  const pairCounts = new Map<string, number>();
  const edgeOffsets = new Map<string, number>();
  for (const edge of graph.edges) {
    const pairKey = [edge.source, edge.target].toSorted().join('<->');
    const idx = pairCounts.get(pairKey) ?? 0;
    pairCounts.set(pairKey, idx + 1);
    const sign = idx % 2 === 0 ? 1 : -1;
    const mag = idx === 0 ? 16 : 22 * Math.ceil(idx / 2) + 12;
    edgeOffsets.set(edge.id, sign * mag);
  }

  const edgeDom = new Map<string, { path: SVGPathElement; label: SVGTextElement }>();

  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.source);
    const dst = nodeMap.get(edge.target);
    if (!src || !dst) continue;
    const { d, labelX, labelY } = edgePathData(edge, src, dst, edgeOffsets.get(edge.id) ?? 16);

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
    edgeDom.set(edge.id, { path, label });
  }

  const rerouteConnectedEdges = (nodeId: string) => {
    for (const edge of graph.edges) {
      if (edge.source !== nodeId && edge.target !== nodeId) continue;
      const src = nodeMap.get(edge.source);
      const dst = nodeMap.get(edge.target);
      const dom = edgeDom.get(edge.id);
      if (!src || !dst || !dom) continue;
      const { d, labelX, labelY } = edgePathData(edge, src, dst, edgeOffsets.get(edge.id) ?? 16);
      dom.path.setAttribute('d', d);
      dom.label.setAttribute('x', labelX.toFixed(1));
      dom.label.setAttribute('y', labelY.toFixed(1));
    }
  };

  // Dragging & Panning state
  let draggingNode: {
    node: DiagramNode;
    group: SVGGElement;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null = null;
  let panning: { startX: number; startY: number; origPanX: number; origPanY: number } | null = null;

  const clientToSvgDelta = (dx: number, dy: number) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width > 0 ? maxX / rect.width : 1;
    const scaleY = rect.height > 0 ? maxY / rect.height : 1;
    return { dx: (dx * scaleX) / zoom, dy: (dy * scaleY) / zoom };
  };

  for (const node of graph.nodes) {
    const isSelected = state.selected?.id === node.id;
    const g = svgEl('g', {
      class: `oui-diagram-card${isSelected ? ' selected' : ''}`,
      transform: `translate(${node.x}, ${node.y})`,
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
      const prefix = p.isKey ? '🔑 ' : '· ';
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
      e.stopPropagation();
      draggingNode = {
        node,
        group: g,
        startX: e.clientX,
        startY: e.clientY,
        origX: node.x,
        origY: node.y,
        moved: false,
      };
    });

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (draggingNode?.moved) return;
      store.setState({
        selected: { kind: node.kind === 'complex' ? 'complexType' : 'entityType', id: node.id },
      });
    });

    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (node.kind === 'entity') {
        store.setState({ diagramFocusType: node.id });
      }
    });

    nodesLayer.appendChild(g);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (draggingNode) return;
    panning = { startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY };
    svg.classList.add('panning');
  });

  const onPointerMove = (e: PointerEvent) => {
    if (draggingNode) {
      const { dx, dy } = clientToSvgDelta(
        e.clientX - draggingNode.startX,
        e.clientY - draggingNode.startY,
      );
      if (Math.hypot(dx, dy) > 3) draggingNode.moved = true;
      draggingNode.node.x = draggingNode.origX + dx;
      draggingNode.node.y = draggingNode.origY + dy;
      draggingNode.group.setAttribute(
        'transform',
        `translate(${draggingNode.node.x.toFixed(1)}, ${draggingNode.node.y.toFixed(1)})`,
      );
      rerouteConnectedEdges(draggingNode.node.id);
    } else if (panning) {
      const { dx, dy } = clientToSvgDelta(e.clientX - panning.startX, e.clientY - panning.startY);
      panX = panning.origPanX + dx * zoom;
      panY = panning.origPanY + dy * zoom;
      applyTransform();
    }
  };

  const onPointerUp = () => {
    if (draggingNode) {
      const ref = draggingNode;
      setTimeout(() => {
        if (draggingNode === ref) draggingNode = null;
      }, 0);
      draggingNode = null;
    }
    if (panning) {
      panning = null;
      svg.classList.remove('panning');
    }
  };

  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointerleave', onPointerUp);

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      zoom = Math.min(2.8, Math.max(0.3, zoom * factor));
      applyTransform();
    },
    { passive: false },
  );

  zoomInBtn.addEventListener('click', () => {
    zoom = Math.min(2.8, zoom * 1.2);
    applyTransform();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoom = Math.max(0.3, zoom * 0.82);
    applyTransform();
  });
  fitBtn.addEventListener('click', () => {
    panX = 0;
    panY = 0;
    zoom = 1;
    applyTransform();
  });

  stage.appendChild(svg);
  return container;
}
