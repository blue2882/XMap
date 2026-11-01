import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateLibrary, migrateMap } from '@/domain/library-migration';

const goodMap = (id: string) => ({
  id, name: id, rootId: 'r',
  nodes: [{ id: 'r', text: 'root', x: 0, y: 0, colorIndex: 0 }],
  edges: [], viewport: { x: 0, y: 0, scale: 1 }, folderId: null,
  createdAt: 'a', updatedAt: 'b',
});

describe('migrateLibrary', () => {
  it('keeps good maps when another map has an out-of-range colorIndex', () => {
    const bad = { ...goodMap('bad'), nodes: [{ id: 'r', text: 't', x: 0, y: 0, colorIndex: 9 }] };
    const { library } = migrateLibrary({ folders: [], maps: [goodMap('a'), bad] });
    expect(library.maps.map((m) => m.id)).toEqual(['a', 'bad']);
    expect(library.maps[1].nodes[0].colorIndex).toBe(3);
  });

  it('accepts the Supabase default row with no version or settings', () => {
    const { library } = migrateLibrary({ folders: [], maps: [goodMap('a')] });
    expect(library.maps).toHaveLength(1);
    expect(library.settings.theme).toBe('system');
  });

  it('fills missing folderId and viewport and clamps scale', () => {
    const legacy = { ...goodMap('legacy'), folderId: undefined, viewport: { zoom: 99 } };
    const { library } = migrateLibrary({ maps: [legacy] });
    expect(library.maps[0].folderId).toBeNull();
    expect(library.maps[0].viewport.scale).toBe(4);
  });

  it('drops dangling edges and unknown folder references', () => {
    const m = { ...goodMap('m'), folderId: 'gone', edges: [{ id: 'e', sourceId: 'r', targetId: 'nope' }] };
    const { library } = migrateLibrary({ maps: [m], folders: [] });
    expect(library.maps[0].edges).toEqual([]);
    expect(library.maps[0].folderId).toBeNull();
  });

  it('quarantines an unrepairable map instead of dropping the library', () => {
    const { library, quarantined } = migrateLibrary({ maps: [goodMap('a'), { id: 'x', nodes: [] }] });
    expect(library.maps.map((m) => m.id)).toEqual(['a']);
    expect(quarantined).toHaveLength(1);
  });

  it('returns an empty library for non-object input', () => {
    expect(migrateLibrary(undefined).library.maps).toEqual([]);
  });

  it('round-trips custom hex color and image on flat nodes', () => {
    const styled = {
      ...goodMap('styled'),
      nodes: [{
        id: 'r',
        text: 'root',
        x: 0,
        y: 0,
        colorIndex: 0,
        color: '#ff0000',
        image: 'data:image/png;base64,abc',
      }],
    };
    const { library } = migrateLibrary({ folders: [], maps: [styled] });
    expect(library.maps[0].nodes[0].color).toBe('#ff0000');
    expect(library.maps[0].nodes[0].image).toBe('data:image/png;base64,abc');
    const again = migrateLibrary(library).library;
    expect(again.maps[0].nodes[0].color).toBe('#ff0000');
    expect(again.maps[0].nodes[0].image).toBe('data:image/png;base64,abc');
  });

  it('drops invalid custom color but keeps the node', () => {
    const map = {
      ...goodMap('bad-color'),
      nodes: [{ id: 'r', text: 'root', x: 0, y: 0, colorIndex: 0, color: 'red' }],
    };
    const { library } = migrateLibrary({ folders: [], maps: [map] });
    expect(library.maps[0].nodes[0].color).toBeUndefined();
  });
});

describe('migrateMap', () => {
  it('preserves color and image on a flat map document', () => {
    const raw = {
      ...goodMap('m'),
      nodes: [{
        id: 'r',
        text: 'root',
        x: 0,
        y: 0,
        colorIndex: 2,
        color: '#ff0000',
        image: 'data:image/png;base64,xyz',
      }],
    };
    const result = migrateMap(raw);
    expect('map' in result).toBe(true);
    if (!('map' in result)) return;
    expect(result.map.nodes[0].color).toBe('#ff0000');
    expect(result.map.nodes[0].image).toBe('data:image/png;base64,xyz');
  });
});

const legacyLibrary = () => ({
  folders: ['Genetics', 'Anatomy'],
  maps: [
    {
      id: 'nuolvfzs',
      name: 'Chapter 17',
      folder: 'Genetics',
      updated: 1793215337319,
      root: {
        id: 'root', t: 'Chapter 17', n: '', k: '', c: false,
        ch: [
          {
            id: 'a', t: '17.1', n: 'Some notes\nline two', k: '', c: false, col: 2,
            ch: [
              { id: 'a1', t: 'Structural Genes', n: 'Each has its own promoter', k: '', c: true, ch: [] },
              { id: 'a2', t: 'What is a repressor?', n: 'Answer: a protein', k: 'q', c: false, ch: [], pos: { x: -379, y: -20 } },
            ],
          },
          { id: 'b', t: '17.2', n: '', k: '', c: false, ch: [] },
        ],
        links: [],
      },
    },
    { id: 'orphan', name: 'Loose', folder: 'Chemistry', updated: 1793325952094, root: { id: 'r', t: 'Central topic', n: '', k: '', c: false, ch: [] } },
  ],
});

describe('migrateLibrary with the legacy Supabase tree format', () => {
  const { library, quarantined } = migrateLibrary(legacyLibrary());
  const map = library.maps[0];
  const node = (id: string) => map.nodes.find((n) => n.id === id);

  it('migrates every map without quarantining', () => {
    expect(quarantined).toEqual([]);
    expect(library.maps.map((m) => m.id)).toEqual(['nuolvfzs', 'orphan']);
  });

  it('flattens the nested tree into nodes and parent edges', () => {
    expect(map.rootId).toBe('root');
    expect(map.nodes).toHaveLength(5);
    expect(map.edges.map((e) => [e.sourceId, e.targetId])).toEqual([
      ['root', 'a'], ['a', 'a1'], ['a', 'a2'], ['root', 'b'],
    ]);
  });

  it('keeps titles, notes, question kind and collapsed state', () => {
    expect(node('a')?.text).toBe('17.1');
    expect(node('a')?.notes).toBe('Some notes\nline two');
    expect(node('a2')?.kind).toBe('question');
    expect(node('a2')?.x).toBe(-379);
    expect(node('a2')?.y).toBe(-20);
    expect(node('a1')?.kind).toBe('topic');
    expect(node('a1')?.collapsed).toBe(true);
  });

  it('colors branches from col and lets descendants inherit it', () => {
    expect(node('a')?.colorIndex).toBe(2);
    expect(node('a1')?.colorIndex).toBe(2);
    expect(node('b')?.colorIndex).toBe(1);
    expect(node('root')?.colorIndex).toBe(0);
  });

  it('lays nodes out instead of leaving every node at the origin', () => {
    expect(new Set(map.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(map.nodes.length);
  });

  it('turns folder names into folder entries and links maps to them', () => {
    const genetics = library.folders.find((f) => f.name === 'Genetics');
    expect(library.folders.map((f) => f.name)).toEqual(['Genetics', 'Anatomy', 'Chemistry']);
    expect(map.folderId).toBe(genetics?.id);
    expect(library.maps[1].folderId).toBe(library.folders[2].id);
  });

  it('converts epoch milliseconds to ISO timestamps', () => {
    expect(map.updatedAt).toBe(new Date(1793215337319).toISOString());
  });

  it('preserves legacy root.links as map.links', () => {
    const raw = legacyLibrary();
    (raw.maps[0].root as { links: { a: string; b: string }[] }).links = [
      { a: 'a1', b: 'b' },
      { a: 'missing', b: 'a' },
    ];
    const { library } = migrateLibrary(raw);
    expect(library.maps[0].links).toEqual([
      { id: 'link_a1_b', sourceId: 'a1', targetId: 'b' },
    ]);
  });

  it('is stable when the migrated library is migrated again', () => {
    const again = migrateLibrary(library).library;
    expect(again.maps.map((m) => m.nodes.map((n) => n.text))).toEqual(
      library.maps.map((m) => m.nodes.map((n) => n.text)),
    );
    expect(again.maps[0].folderId).toBe(map.folderId);
    expect(again.maps[0].nodes.map((n) => n.notes)).toEqual(map.nodes.map((n) => n.notes));
  });
});

describe('data.json.example', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data.json.example', import.meta.url), 'utf8')) as {
    maps: { id: string; root: { detached?: boolean; pos?: { x: number; y: number }; ch?: unknown[] } }[];
  };
  const { library, quarantined } = migrateLibrary(raw);

  it('keeps every map, note, question, folder, hand position, and detached node', () => {
    expect(quarantined).toEqual([]);
    expect(library.maps).toHaveLength(raw.maps.length);
    expect(library.folders.map((f) => f.name)).toEqual(['Genetics', 'Anatomy']);
    const nodes = library.maps.flatMap((m) => m.nodes);
    expect(nodes.filter((n) => n.notes).length).toBeGreaterThan(0);
    expect(nodes.filter((n) => n.kind === 'question')).toHaveLength(8);
    expect(nodes.filter((n) => n.detached)).toHaveLength(1);
    const pinned = nodes.find((n) => n.x === -442.296222321224);
    expect(pinned?.y).toBe(-311.4819053866852);
    const untitled = library.maps.find((m) => m.name === 'Untitled map');
    const detached = untitled?.nodes.find((n) => n.detached);
    expect(untitled?.edges.some((e) => e.targetId === detached?.id)).toBe(false);
  });
});
