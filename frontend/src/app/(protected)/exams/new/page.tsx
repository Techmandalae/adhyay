"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GenerationLoader } from "@/components/ui/GenerationLoader";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  generateExam,
  getAcademicBooksBySubjectId,
  getAcademicChapters,
  getSubjects,
  getTeacherCatalog,
  getTemplates
} from "@/lib/api";
import { normalizeSubjectsResponse, normalizeTeacherCatalog } from "@/lib/catalog";
import type { AcademicBook, AcademicChapter, AcademicClass, AcademicSubject } from "@/types/academic";
import type { GenerateExamInput } from "@/types/exam";

const defaultExamInput: GenerateExamInput = {
  topic: "",
  subject: "",
  subjectId: "",
  classId: "",
  sectionId: "",
  language: "english",
  difficulty: "medium",
  templateId: "",
  mode: "NCERT_ONLY",
  ncertBookIds: [],
  referenceBookIds: [],
  ncertChapters: [],
  chapterIds: [],
  bookIds: []
};

export default function NewExamPage() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTemplateId = searchParams.get("templateId") ?? "";
  const [examForm, setExamForm] = useState<GenerateExamInput>({
    ...defaultExamInput,
    templateId: initialTemplateId
  });
  const [classOptions, setClassOptions] = useState<AcademicClass[]>([]);
  const [classSubjects, setClassSubjects] = useState<AcademicSubject[]>([]);
  const [ncertBooks, setNcertBooks] = useState<AcademicBook[]>([]);
  const [referenceBooks, setReferenceBooks] = useState<AcademicBook[]>([]);
  const [chapters, setChapters] = useState<AcademicChapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadInitialData = async () => {
      try {
        const [catalogResponse, templatesResponse] = await Promise.all([
          getTeacherCatalog(token),
          getTemplates(token)
        ]);

        if (!isActive) {
          return;
        }

        setClassOptions(normalizeTeacherCatalog(catalogResponse).classOptions);
        setTemplates(templatesResponse.items.map((item) => ({ id: item.id, name: item.name })));
      } catch (error) {
        if (!isActive) {
          return;
        }
        setCatalogError(error instanceof Error ? error.message : "Failed to load exam setup.");
      }
    };

    void loadInitialData();

    return () => {
      isActive = false;
    };
  }, [token]);

  const handleClassChange = async (optionId: string) => {
    const selectedOption = classOptions.find((item) => item.id === optionId);
    setExamForm((current) => ({
      ...current,
      classId: selectedOption?.classId ?? "",
      sectionId: selectedOption?.sectionId ?? "",
      subjectId: "",
      subject: "",
      ncertBookIds: [],
      referenceBookIds: [],
      chapterIds: [],
      ncertChapters: [],
      bookIds: []
    }));
    setClassSubjects([]);
    setNcertBooks([]);
    setReferenceBooks([]);
    setChapters([]);
    setSelectedChapters([]);

    if (!token || !selectedOption?.classId) {
      return;
    }

    try {
      const response = await getSubjects(token, selectedOption.classId);
      setClassSubjects(normalizeSubjectsResponse(response));
    } catch {
      setClassSubjects([]);
    }
  };

  const handleSubjectChange = async (subjectId: string) => {
    const subject = classSubjects.find((item) => item.id === subjectId);
    setExamForm((current) => ({
      ...current,
      subjectId,
      subject: subject?.name ?? "",
      ncertBookIds: [],
      referenceBookIds: [],
      chapterIds: [],
      ncertChapters: [],
      bookIds: []
    }));
    setNcertBooks([]);
    setReferenceBooks([]);
    setChapters([]);
    setSelectedChapters([]);

    if (!token || !subjectId || !examForm.classId) {
      return;
    }

    try {
      const response = await getAcademicBooksBySubjectId(token, examForm.classId, subjectId);
      setNcertBooks(response.ncertBooks);
      setReferenceBooks(response.referenceBooks);
    } catch {
      setNcertBooks([]);
      setReferenceBooks([]);
    }
  };

  const handleNcertBooksChange = async (selectedBookIds: string[]) => {
    setExamForm((current) => ({
      ...current,
      ncertBookIds: selectedBookIds,
      chapterIds: [],
      ncertChapters: [],
      bookIds: [...new Set([...selectedBookIds, ...(current.referenceBookIds ?? [])])]
    }));
    setSelectedChapters([]);

    if (!token || selectedBookIds.length === 0 || examForm.mode === "REFERENCE_ONLY") {
      setChapters([]);
      return;
    }

    try {
      const responses = await Promise.all(
        selectedBookIds.map((bookId) =>
          getAcademicChapters(token, bookId, examForm.classId, examForm.subjectId)
        )
      );

      const unique = new Map<string, AcademicChapter>();
      responses.forEach((response) => {
        response.items.forEach((chapter) => {
          unique.set(chapter.id, {
            ...chapter,
            bookName: response.bookName
          });
        });
      });

      setChapters(Array.from(unique.values()));
    } catch {
      setChapters([]);
    }
  };

  const handleReferenceBooksChange = (selectedBookIds: string[]) => {
    setExamForm((current) => ({
      ...current,
      referenceBookIds: selectedBookIds,
      bookIds: [...new Set([...(current.ncertBookIds ?? []), ...selectedBookIds])]
    }));
  };

  const handleChapterChange = (chapterIds: string[]) => {
    setSelectedChapters(chapterIds);
    setExamForm((current) => ({
      ...current,
      chapterIds,
      ncertChapters: chapters
        .filter((chapter) => chapterIds.includes(chapter.id))
        .map((chapter) => chapter.title)
    }));
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setStatus({ state: "loading" });
    try {
      const response = await generateExam(token, {
        ...examForm,
        bookIds:
          examForm.bookIds && examForm.bookIds.length > 0
            ? examForm.bookIds
            : [...(examForm.ncertBookIds ?? []), ...(examForm.referenceBookIds ?? [])]
      });

      setStatus({ state: "success", message: "Exam generated successfully." });
      setExamForm(defaultExamInput);
      setClassSubjects([]);
      setNcertBooks([]);
      setReferenceBooks([]);
      setChapters([]);
      setSelectedChapters([]);
      router.push(`/teacher/exams/${response.examId}`);
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Failed to generate exam."
      });
    }
  };

  return (
    <RequireRole roles={["TEACHER"]}>
      <PageFade>
        <div className="mx-auto grid max-w-5xl gap-8">
          <SectionHeader
            eyebrow="Exam generation"
            title="Create a new exam"
            subtitle="Use the streamlined generator and keep history, analytics, and reports on separate pages."
          />

          {catalogError ? (
            <StatusBlock tone="negative" title="Setup unavailable" description={catalogError} />
          ) : null}

          {status.state === "loading" ? (
            <GenerationLoader label="Analyzing syllabus, picking chapters, and structuring the paper." />
          ) : null}

          <Card className="space-y-6">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleGenerate}>
              <Select
                label="Class"
                value={examForm.sectionId || examForm.classId || ""}
                onChange={(event) => void handleClassChange(event.target.value)}
                required
              >
                <option value="">Select class</option>
                {classOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Subject"
                value={examForm.subjectId ?? ""}
                onChange={(event) => void handleSubjectChange(event.target.value)}
                required
              >
                <option value="">Select subject</option>
                {classSubjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Difficulty"
                value={examForm.difficulty}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    difficulty: event.target.value as GenerateExamInput["difficulty"]
                  }))
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>

              <Select
                label="Language"
                value={examForm.language}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    language: event.target.value as GenerateExamInput["language"]
                  }))
                }
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="punjabi">Punjabi</option>
              </Select>

              <Select
                label="Generation mode"
                value={examForm.mode}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    mode: event.target.value as GenerateExamInput["mode"]
                  }))
                }
              >
                <option value="NCERT_ONLY">NCERT only</option>
                <option value="NCERT_PLUS_REFERENCE">NCERT + Reference</option>
                <option value="REFERENCE_ONLY">Reference only</option>
              </Select>

              <Select
                label="Template"
                value={examForm.templateId ?? ""}
                onChange={(event) =>
                  setExamForm((current) => ({ ...current, templateId: event.target.value }))
                }
              >
                <option value="">No template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>

              <Select
                label="NCERT books"
                multiple
                size={Math.min(Math.max(ncertBooks.length, 3), 6)}
                value={examForm.ncertBookIds}
                onChange={(event) =>
                  void handleNcertBooksChange(
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className="min-h-32"
              >
                {ncertBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Reference books"
                multiple
                size={Math.min(Math.max(referenceBooks.length, 3), 6)}
                value={examForm.referenceBookIds ?? []}
                onChange={(event) =>
                  handleReferenceBooksChange(
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className="min-h-32"
              >
                {referenceBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </Select>

              <div className="md:col-span-2">
                <Select
                  label="Chapters"
                  multiple
                  size={Math.min(Math.max(chapters.length, 4), 8)}
                  value={selectedChapters}
                  onChange={(event) =>
                    handleChapterChange(
                      Array.from(event.target.selectedOptions).map((option) => option.value)
                    )
                  }
                  className="min-h-40"
                >
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.bookName ? `${chapter.bookName} | ` : ""}
                      {chapter.title}
                    </option>
                  ))}
                </Select>
              </div>

              {status.state === "error" ? (
                <div className="md:col-span-2">
                  <StatusBlock tone="negative" title="Generation failed" description={status.message ?? ""} />
                </div>
              ) : null}

              <div className="md:col-span-2 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={
                    status.state === "loading" ||
                    !examForm.classId ||
                    !examForm.subjectId ||
                    (examForm.mode === "REFERENCE_ONLY"
                      ? (examForm.referenceBookIds?.length ?? 0) === 0
                      : selectedChapters.length === 0)
                  }
                >
                  {status.state === "loading" ? "Generating..." : "Generate exam"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/exams/history")}>
                  View history
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </PageFade>
    </RequireRole>
  );
}
