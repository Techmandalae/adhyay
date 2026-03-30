export type AcademicClass = {
  id: string;
  label: string;
  classId: string;
  classLevel: number;
  sectionId: string;
  sectionName: string;
  classStandardId: string;
  className: string;
};

export type AcademicSubject = {
  id: string;
  name: string;
  classId: string;
};

export type AcademicBook = {
  id: string;
  name: string;
  type: "NCERT" | "REFERENCE";
  subjectId: string;
};

export type AcademicChapter = {
  id: string;
  title: string;
  bookId: string;
  bookName?: string;
};

export type AcademicBooksResponse = {
  ncertBooks: AcademicBook[];
  referenceBooks: AcademicBook[];
  items?: AcademicBook[];
};

export type AcademicChaptersResponse = {
  subjectId: string;
  bookName: string;
  items: AcademicChapter[];
};

export type AcademicSection = {
  id: string;
  name: string;
};

export type AcademicBookWithChapters = {
  id: string;
  name: string;
  type: "NCERT" | "REFERENCE";
  chapters: Array<{ id: string; name: string }>;
};

export type AcademicSubjectWithBooks = {
  subjectId: string;
  name: string;
  books: AcademicBookWithChapters[];
};

export type AcademicCatalogClass = {
  classId: string;
  className: string;
  classLevel: number | null;
  sections: AcademicSection[];
  subjects: AcademicSubjectWithBooks[];
};

export type TeacherCatalogFallbackResponse = {
  classes: Array<{ id: string; name: string }>;
  subjects: [];
  books: [];
  chapters: [];
};

export type TeacherCatalogResponse = AcademicCatalogClass[] | TeacherCatalogFallbackResponse;
