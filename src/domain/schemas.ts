import { z } from 'zod';

export const LIBRARY_STORAGE_KEY = 'mindmaps.library.v1';
export const QUARANTINE_STORAGE_KEY = 'mindmaps.library.quarantine.v1';

export const themeSchema = z.enum(['light', 'dark', 'system']);
export type ThemePreference = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  theme: themeSchema.default('system'),
  anthropicApiKey: z.string().default(''),
});

export const folderSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number().min(0.1).max(4),
});

export const mindMapNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  colorIndex: z.number().int().min(0).max(5),
  collapsed: z.boolean().default(false),
  notes: z.string().default(''),
  kind: z.enum(['topic', 'question']).default('topic'),
  detached: z.boolean().default(false),
  /** Custom fill colour (#rrggbb). Overrides the inherited branch colour. */
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  /** Picture shown above the label, stored as a data URL. */
  image: z.string().optional(),
});

export const mindMapEdgeSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
});

export const mindMapLinkSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
});

export const mindMapDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootId: z.string(),
  nodes: z.array(mindMapNodeSchema),
  edges: z.array(mindMapEdgeSchema),
  links: z.array(mindMapLinkSchema).default([]),
  viewport: viewportSchema,
  folderId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const libraryStateSchema = z.object({
  version: z.literal(1),
  maps: z.array(mindMapDocumentSchema),
  folders: z.array(folderSchema),
  settings: settingsSchema,
});

export type Settings = z.infer<typeof settingsSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export type MindMapNode = z.input<typeof mindMapNodeSchema>;
export type MindMapEdge = z.infer<typeof mindMapEdgeSchema>;
export type MindMapLink = z.infer<typeof mindMapLinkSchema>;
export type MindMapDocument = Omit<z.infer<typeof mindMapDocumentSchema>, 'nodes' | 'links'> & {
  nodes: MindMapNode[];
  links?: MindMapLink[];
};
export type LibraryState = z.infer<typeof libraryStateSchema>;

export function createDefaultLibraryState(): LibraryState {
  return {
    version: 1,
    maps: [],
    folders: [],
    settings: { theme: 'system', anthropicApiKey: '' },
  };
}
