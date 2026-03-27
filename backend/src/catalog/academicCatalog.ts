export type CatalogSubject = {
  name: string;
  ncertBookNames?: string[];
  referenceBookNames?: string[];
  chapterTitles?: string[];
};

export type CatalogClass = {
  classLevel: number;
  name: string;
  subjects: CatalogSubject[];
};

// Static catalog is intentionally empty; DB-backed academic structure is the source of truth.
export const ACADEMIC_CATALOG: readonly CatalogClass[] = [];
