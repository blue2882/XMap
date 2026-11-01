const IMPORT_SUFFIXES = ['.json', '.pptx'] as const;

export const isImportFileName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return IMPORT_SUFFIXES.some((suffix) => lower.endsWith(suffix));
};

/** First file from a drag-and-drop payload, validated at the boundary. */
export const firstImportFileFromDataTransfer = (
  dataTransfer: DataTransfer | null | undefined,
): File | null => {
  if (!dataTransfer?.files?.length) return null;
  const file = dataTransfer.files[0];
  if (!(file instanceof File)) return null;
  if (typeof file.name !== 'string' || !file.name.trim()) return null;
  if (!isImportFileName(file.name)) return null;
  return file;
};
