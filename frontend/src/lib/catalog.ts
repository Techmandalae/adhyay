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
  const deduped = new Map<string, AcademicSubject>();

  subjects.forEach((subject) => {
    const normalizedName = subject.name.trim().toLowerCase();
    if (!normalizedName || deduped.has(normalizedName)) {
      return;
    }

    deduped.set(normalizedName, {
      id: subject.id,
      name: subject.name,
      classId: classIdOverride ?? subject.classId
    });
  });

  return Array.from(deduped.values());
}

export function getFallbackClassIdFromOption(
  option?: Pick<AcademicClass, "classLevel" | "className" | "label"> | null
) {
  const level =
    option?.classLevel ??
    extractClassLevel(option?.className ?? option?.label ?? "");
  return level ? `default-${level}` : null;
}

export function getBaseClassName(value: string) {
  return value.replace(/\s*[A-Z]$/, "").trim();
}

export function getCatalogLookupClassId(
  option?: Pick<AcademicClass, "classId" | "classLevel" | "className" | "label"> | null
) {
  return getFallbackClassIdFromOption(
    option
      ? {
          ...option,
          className: getBaseClassName(option.className ?? option.label ?? "")
        }
      : option
  ) ?? option?.classId ?? null;
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

export function getPublishableClassOptions(
  classOptions: AcademicClass[],
  target: Pick<AcademicClass, "classId" | "sectionId"> | { classId?: string | null; sectionId?: string | null }
) {
  const classId = target.classId ?? "";
  const sectionId = target.sectionId ?? "";
  const sameClassOptions = classOptions.filter((item) => item.classId === classId);

  if (sameClassOptions.length > 0) {
    return sameClassOptions;
  }

  const exactMatch = classOptions.find(
    (item) => item.classId === classId && item.sectionId === sectionId
  );

  if (exactMatch) {
    return [exactMatch];
  }

  return classOptions.filter((item) => item.classId === classId);
}
