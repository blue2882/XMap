import { layoutNodesWithDagre } from '@/domain/dagre-layout';
import {
  createDefaultLibraryState,
  folderSchema,
  mindMapDocumentSchema,
  settingsSchema,
  type Folder,
  type LibraryState,
} from '@/domain/schemas';

const COLOR_COUNT = 6;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type ParsedMap = LibraryState['maps'][number];
type Rec = Record<string, unknown>;

export type QuarantinedMap = { raw: unknown; reason: string };
export type LibraryMigration = { library: LibraryState; quarantined: QuarantinedMap[] };
export type MapMigration = { map: ParsedMap } | { reason: string };

/** `name` refs (legacy maps) may create a folder. `id` refs must already exist. */
type FolderResolver = (ref: unknown, by: 'name' | 'id') => string | null;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const first = (r: Rec, keys: string[]): unknown => keys.map((k) => r[k]).find((v) => v != null);

function colorIndex(v: unknown, fallback = 0): number {
  const n = Math.trunc(num(v, fallback));
  return ((n % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
}

const optionalHexColor = (v: unknown): string | undefined => {
  const s = str(v);
  return s && HEX_COLOR.test(s) ? s : undefined;
};

const optionalImage = (v: unknown): string | undefined => {
  const s = str(v);
  return s || undefined;
};

function isoFromEpoch(v: unknown, fallback: string): string {
  const ms = num(v, NaN);
  const date = new Date(ms);
  return Number.isFinite(ms) && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function migrateViewport(raw: unknown): Rec {
  const v = isRec(raw) ? raw : {};
  const scale = num(first(v, ['scale', 'zoom']), 1);
  return { x: num(v.x, 0), y: num(v.y, 0), scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) };
}

type LegacyFrame = { raw: Rec; parentId: string | null; inherited: number; siblingIndex: number };

/**
 * Legacy maps store a nested tree: root.ch[] children, t title, n notes,
 * k kind ("q" = question), c collapsed, col branch color on top-level branches.
 * Nodes with `pos` keep that point after layout. `detached` nodes get no parent edge.
 */
function flattenLegacyTree(root: Rec, mapId: string): {
  nodes: Rec[];
  edges: Rec[];
  rootId: string;
  pinned: Map<string, { x: number; y: number }>;
} {
  const nodes: Rec[] = [];
  const edges: Rec[] = [];
  const pinned = new Map<string, { x: number; y: number }>();
  const usedIds = new Set<string>();
  const stack: LegacyFrame[] = [{ raw: root, parentId: null, inherited: 0, siblingIndex: 0 }];
  let rootId = '';

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    const { raw, parentId } = frame;
    const declared = str(raw.id);
    const id = declared && !usedIds.has(declared) ? declared : `${mapId}_n${usedIds.size}`;
    usedIds.add(id);

    const detached = raw.detached === true;
    const pos = isRec(raw.pos) ? { x: num(raw.pos.x, NaN), y: num(raw.pos.y, NaN) } : null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) pinned.set(id, pos);
    const isRoot = parentId === null;
    const color = isRoot
      ? 0
      : parentId === rootId
        ? colorIndex(raw.col, frame.siblingIndex)
        : frame.inherited;

    nodes.push({
      id,
      text: str(raw.t) ?? '',
      x: pos && Number.isFinite(pos.x) ? pos.x : 0,
      y: pos && Number.isFinite(pos.y) ? pos.y : 0,
      colorIndex: color,
      collapsed: raw.c === true,
      notes: str(raw.n) ?? '',
      kind: raw.k === 'q' ? 'question' : 'topic',
      detached,
    });
    if (isRoot) rootId = id;
    else if (!detached) edges.push({ id: `edge_${parentId}_${id}`, sourceId: parentId, targetId: id });

    const children = Array.isArray(raw.ch) ? raw.ch.filter(isRec) : [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ raw: children[i], parentId: id, inherited: color, siblingIndex: i });
    }
  }
  return { nodes, edges, rootId, pinned };
}

function migrateFlatNode(raw: unknown): Rec | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const node: Rec = {
    id,
    text: str(first(raw, ['text', 'label', 'title', 'name'])) ?? '',
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    colorIndex: colorIndex(first(raw, ['colorIndex', 'color'])),
    collapsed: raw.collapsed === true,
    notes: str(raw.notes) ?? '',
    kind: raw.kind === 'question' ? 'question' : 'topic',
    detached: raw.detached === true,
  };
  const color = optionalHexColor(raw.color);
  if (color) node.color = color;
  const image = optionalImage(raw.image);
  if (image) node.image = image;
  return node;
}

function migrateFlatEdges(rawEdges: unknown, nodeIds: Set<string>): Rec[] {
  const edges: Rec[] = [];
  for (const raw of Array.isArray(rawEdges) ? rawEdges : []) {
    if (!isRec(raw)) continue;
    const sourceId = str(first(raw, ['sourceId', 'source', 'from']));
    const targetId = str(first(raw, ['targetId', 'target', 'to']));
    if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
    edges.push({ id: str(raw.id) ?? `edge_${sourceId}_${targetId}`, sourceId, targetId });
  }
  return edges;
}

function migrateLegacyRootLinks(rawLinks: unknown, nodeIds: Set<string>): Rec[] {
  const links: Rec[] = [];
  for (const raw of Array.isArray(rawLinks) ? rawLinks : []) {
    if (!isRec(raw)) continue;
    const a = str(raw.a);
    const b = str(raw.b);
    if (!a || !b || !nodeIds.has(a) || !nodeIds.has(b)) continue;
    links.push({ id: `link_${a}_${b}`, sourceId: a, targetId: b });
  }
  return links;
}

function migrateFlatLinks(rawLinks: unknown, nodeIds: Set<string>): Rec[] {
  const links: Rec[] = [];
  for (const raw of Array.isArray(rawLinks) ? rawLinks : []) {
    if (!isRec(raw)) continue;
    const sourceId = str(first(raw, ['sourceId', 'source', 'from']));
    const targetId = str(first(raw, ['targetId', 'target', 'to']));
    if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
    links.push({ id: str(raw.id) ?? `link_${sourceId}_${targetId}`, sourceId, targetId });
  }
  return links;
}

function pickRoot(declared: string | undefined, nodes: Rec[], edges: Rec[]): string {
  const ids = new Set(nodes.map((n) => n.id as string));
  if (declared && ids.has(declared)) return declared;
  const targets = new Set(edges.map((e) => e.targetId as string));
  return (nodes.find((n) => !targets.has(n.id as string))?.id as string) ?? (nodes[0].id as string);
}

export function migrateMap(raw: unknown, resolveFolder: FolderResolver = () => null): MapMigration {
  if (!isRec(raw)) return { reason: 'not an object' };
  const id = str(raw.id);
  if (!id) return { reason: 'missing id' };

  const now = new Date().toISOString();
  const legacy = isRec(raw.root) && !Array.isArray(raw.nodes);
  let nodes: Rec[];
  let edges: Rec[];
  let rootId: string;
  let pinned = new Map<string, { x: number; y: number }>();
  if (legacy) {
    ({ nodes, edges, rootId, pinned } = flattenLegacyTree(raw.root as Rec, id));
  } else {
    nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).map(migrateFlatNode).filter((n): n is Rec => n !== null);
    if (nodes.length === 0) return { reason: 'no usable nodes' };
    edges = migrateFlatEdges(raw.edges, new Set(nodes.map((n) => n.id as string)));
    rootId = pickRoot(str(raw.rootId), nodes, edges);
  }

  const updatedAt = legacy
    ? isoFromEpoch(raw.updated, now)
    : (str(raw.updatedAt) ?? str(raw.createdAt) ?? now);
  const nodeIds = new Set(nodes.map((n) => n.id as string));
  const links = legacy
    ? migrateLegacyRootLinks(isRec(raw.root) ? (raw.root as Rec).links : undefined, nodeIds)
    : migrateFlatLinks(raw.links, nodeIds);
  const parsed = mindMapDocumentSchema.safeParse({
    id,
    name: str(raw.name) ?? 'Untitled map',
    rootId,
    nodes,
    edges,
    links,
    viewport: migrateViewport(raw.viewport),
    folderId: legacy ? resolveFolder(raw.folder, 'name') : resolveFolder(raw.folderId, 'id'),
    createdAt: legacy ? updatedAt : (str(raw.createdAt) ?? updatedAt),
    updatedAt,
  });
  if (!parsed.success) return { reason: parsed.error.message };
  if (!legacy) return { map: parsed.data };
  const laid = layoutNodesWithDagre(parsed.data) as ParsedMap['nodes'];
  return {
    map: {
      ...parsed.data,
      nodes: laid.map((node) => {
        const point = pinned.get(node.id);
        return point ? { ...node, x: point.x, y: point.y } : node;
      }),
    },
  };
}

function folderIdForName(name: string): string {
  return `folder_${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

export function migrateLibrary(raw: unknown): LibraryMigration {
  const defaults = createDefaultLibraryState();
  const quarantined: QuarantinedMap[] = [];
  if (!isRec(raw)) return { library: defaults, quarantined };

  const folders: Folder[] = [];
  const byId = new Map<string, Folder>();
  const byName = new Map<string, Folder>();
  const register = (folder: Folder) => {
    if (byId.has(folder.id)) return;
    byId.set(folder.id, folder);
    byName.set(folder.name, folder);
    folders.push(folder);
  };
  for (const item of Array.isArray(raw.folders) ? raw.folders : []) {
    if (typeof item === 'string' && item.trim()) {
      register({ id: folderIdForName(item), name: item });
      continue;
    }
    const parsed = folderSchema.safeParse(item);
    if (parsed.success) register(parsed.data);
  }

  const resolveFolder: FolderResolver = (ref, by) => {
    const value = str(ref)?.trim();
    if (!value) return null;
    if (by === 'id') return byId.has(value) ? value : null;
    const named = byName.get(value);
    if (named) return named.id;
    const created = { id: folderIdForName(value), name: value };
    register(created);
    return created.id;
  };

  const seen = new Set<string>();
  const maps: ParsedMap[] = [];
  for (const item of Array.isArray(raw.maps) ? raw.maps : []) {
    const result = migrateMap(item, resolveFolder);
    if ('reason' in result) {
      quarantined.push({ raw: item, reason: result.reason });
    } else if (!seen.has(result.map.id)) {
      seen.add(result.map.id);
      maps.push(result.map);
    }
  }

  const settings = settingsSchema.safeParse(raw.settings);
  return {
    library: { version: 1, maps, folders, settings: settings.success ? settings.data : defaults.settings },
    quarantined,
  };
}
