import type {
  AcademicCatalogClass,
  AcademicClass,
  AcademicSubject,
  TeacherCatalogResponse
} from "@/types/academic";

function extractClassLevel(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const level = Number(match[1]);
  return Number.isFinite(level) ? level : null;
}

export function buildCatalogClassOptions(catalog: AcademicCatalogClass[]): AcademicClass[] {
  return catalog.flatMap((item) => {
    if (item.sections.length === 0) {
      return [
        {
          id: item.classId,
          label: item.className,
          classId: item.classId,
          classLevel: item.classLevel ?? 0,
          sectionId: "",
          sectionName: "",
          classStandardId: item.classId,
          className: item.className
        }
      ];
    }

    return item.sections.map((section) => {
      const suffix = /^[A-Z]$/.test(section.name) ? section.name : ` ${section.name}`;
      return {
        id: section.id,
        label: `${item.className}${suffix}`,
        classId: item.classId,
        classLevel: item.classLevel ?? 0,
        sectionId: section.id,
        sectionName: section.name,
        classStandardId: item.classId,
        className: item.className
      };
    });
  });
}

export function normalizeTeacherCatalog(
  response: TeacherCatalogResponse
): { catalogClasses: AcademicCatalogClass[]; classOptions: AcademicClass[] } {
  if (Array.isArray(response)) {
    return {
      catalogClasses: response,
      classOptions: buildCatalogClassOptions(response)
    };
  }

  const classes = response.classes || [];
  const catalogClasses: AcademicCatalogClass[] = classes.map((cls, index) => ({
    classId: cls.id,
    className: cls.name,
    classLevel: index + 1,
    sections: [],
    subjects: []
  }));

  return {
    catalogClasses,
    classOptions: buildCatalogClassOptions(catalogClasses)
  };
}

export function normalizeSubjectsResponse(
  response: { items?: AcademicSubject[] } | AcademicSubject[],
  classIdOverride?: string
): AcademicSubject[] {
  const subjects = Array.isArray(response) ? response : response.items || [];

  return subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    classId: classIdOverride ?? subject.classId
  }));
}

export function getFallbackClassIdFromOption(
  option?: Pick<AcademicClass, "classLevel" | "className" | "label"> | null
) {
  const level =
    option?.classLevel ??
    extractClassLevel(option?.className ?? option?.label ?? "");
  return level ? `default-${level}` : null;
}

export function isValidAcademicSubject(
  subjects: AcademicSubject[],
  subjectId: string | null | undefined
) {
  if (!subjectId) {
    return false;
  }

  return subjects.some((subject) => subject.id === subjectId);
}
