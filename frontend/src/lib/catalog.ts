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

function resolveCatalogClassLevel(name: string, fallbackIndex: number) {
  return extractClassLevel(name) ?? fallbackIndex + 1;
}

function compareClassNames(left: string, right: string) {
  const leftLevel = extractClassLevel(left);
  const rightLevel = extractClassLevel(right);

  if (leftLevel !== null && rightLevel !== null && leftLevel !== rightLevel) {
    return leftLevel - rightLevel;
  }

  if (leftLevel !== null && rightLevel === null) {
    return -1;
  }

  if (leftLevel === null && rightLevel !== null) {
    return 1;
  }

  return left.localeCompare(right);
}

export function buildCatalogClassOptions(catalog: AcademicCatalogClass[]): AcademicClass[] {
  return [...catalog]
    .sort(
      (left, right) =>
        (left.classLevel ?? Number.MAX_SAFE_INTEGER) - (right.classLevel ?? Number.MAX_SAFE_INTEGER) ||
        compareClassNames(left.className, right.className)
    )
    .flatMap((item) => {
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

    return [...item.sections]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((section) => {
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

  const classes = [...(response.classes || [])].sort((left, right) =>
    compareClassNames(left.name, right.name)
  );
  const catalogClasses: AcademicCatalogClass[] = classes.map((cls, index) => ({
    classId: cls.id,
    className: cls.name,
    classLevel: resolveCatalogClassLevel(cls.name, index),
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
