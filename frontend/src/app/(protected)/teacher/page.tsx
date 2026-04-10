"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { BarChart } from "@/components/analytics/BarChart";
import { DataTable } from "@/components/analytics/DataTable";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { TrendChart } from "@/components/analytics/TrendChart";
import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  generateExam,
  getSubjects,
  getAcademicBooksBySubjectId,
  getAcademicChapters,
  getTemplates,
  getTeacherCatalog,
  getTeacherAnalytics,
  getExams,
  getEvaluation,
  getPendingEvaluations,
  publishExam,
  archiveExam,
  downloadExamPdf,
  downloadExamDocx,
  downloadAnswerKeyPdf,
  reviewEvaluation
} from "@/lib/api";
import { summarizeNotifications } from "@/lib/notifications";
import type { TeacherAnalyticsResponse } from "@/types/analytics";
import type {
  AcademicChapter,
  AcademicClass,
  AcademicCatalogClass,
  AcademicSubject,
  AcademicBook,
  TeacherCatalogResponse
} from "@/types/academic";
import type {
  ExamSummary,
  GenerateExamInput,
  GenerateExamResponse,
  ExamTemplateSection
} from "@/types/exam";
import type { EvaluationDetail, EvaluationResult, EvaluationSummary } from "@/types/evaluation";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

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

const generationSteps = [
  "Analyzing syllabus...",
  "Generating questions...",
  "Structuring exam...",
  "Finalizing paper..."
];

function buildCatalogClassOptions(catalog: AcademicCatalogClass[]): AcademicClass[] {
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

function normalizeTeacherCatalog(
  response: TeacherCatalogResponse
): { catalogClasses: AcademicCatalogClass[]; classOptions: AcademicClass[] } {
  if (Array.isArray(response)) {
    console.log("Catalog classes:", response.map((item) => ({
      id: item.classId,
      name: item.className
    })));
    return {
      catalogClasses: response,
      classOptions: buildCatalogClassOptions(response)
    };
  }

  const classes = response.classes || [];
  console.log("Catalog classes:", classes);

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

function normalizeSubjectsResponse(
  response: { items?: AcademicSubject[] } | AcademicSubject[]
): AcademicSubject[] {
  const subjects = Array.isArray(response) ? response : response.items || [];

  console.log("Subjects API response:", response);

  if (!subjects || subjects.length === 0) {
    console.warn("No subjects returned");
    return [];
  }

  return subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    classId: subject.classId
  }));
}

export default function TeacherDashboard() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [examForm, setExamForm] = useState(defaultExamInput);
  const [examStatus, setExamStatus] = useState<AsyncState<GenerateExamResponse>>({
    status: "idle",
    data: null
  });
  const [examList, setExamList] = useState<AsyncState<ExamSummary[]>>({
    status: "idle",
    data: null
  });
  const [pendingList, setPendingList] = useState<AsyncState<EvaluationSummary[]>>({
    status: "idle",
    data: null
  });
  const [selectedEvaluation, setSelectedEvaluation] = useState<AsyncState<EvaluationDetail>>({
    status: "idle",
    data: null
  });
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewScore, setReviewScore] = useState<string>("");
  const [reviewStatus, setReviewStatus] = useState<AsyncState<EvaluationDetail>>({
    status: "idle",
    data: null
  });
  const [analyticsState, setAnalyticsState] = useState<AsyncState<TeacherAnalyticsResponse>>({
    status: "idle",
    data: null
  });
  const [analyticsFilters, setAnalyticsFilters] = useState({
    startDate: "",
    endDate: "",
    subject: "",
    classLevel: "",
    difficulty: ""
  });
  const [classOptions, setClassOptions] = useState<Array<AcademicClass>>([]);
  const [classSubjects, setClassSubjects] = useState<AcademicSubject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [ncertBooks, setNcertBooks] = useState<AcademicBook[]>([]);
  const [referenceBooks, setReferenceBooks] = useState<AcademicBook[]>([]);
  const [chapters, setChapters] = useState<AcademicChapter[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; sections: ExamTemplateSection[] }>>([]);
  const [templateStatus, setTemplateStatus] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });

  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (templateId) {
      setExamForm((prev) => ({ ...prev, templateId }));
    }
  }, [searchParams]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async (examId: string) => {
    if (!token) return;
    const blob = await downloadExamPdf(token, examId);
    triggerDownload(blob, `exam-${examId}.pdf`);
  };

  const handleDownloadDocx = async (examId: string) => {
    if (!token) return;
    const blob = await downloadExamDocx(token, examId);
    triggerDownload(blob, `exam-${examId}.docx`);
  };

  const handleDownloadAnswerKey = async (examPaperId?: string | null) => {
    if (!token || !examPaperId) return;
    const blob = await downloadAnswerKeyPdf(token, examPaperId);
    triggerDownload(blob, `answer-key-${examPaperId}.pdf`);
  };
  const [academicStatus, setAcademicStatus] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [statusUpdate, setStatusUpdate] = useState<
    AsyncState<{ examId: string; status: string }>
  >({
    status: "idle",
    data: null
  });
  const [publishSelections, setPublishSelections] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);

  const isTeacher = user?.role === "TEACHER";
  const canCallApi = Boolean(token);
  const canPublishExams = Boolean(user?.canPublish ?? true);

  useEffect(() => {
    if (!isGenerating) {
      setProgress(0);
      setStep(0);
      return;
    }

    let currentProgress = 0;

    const interval = window.setInterval(() => {
      currentProgress += Math.random() * 10;

      if (currentProgress >= 90) {
        currentProgress = 90;
        window.clearInterval(interval);
      }

      setProgress(Math.floor(currentProgress));

      if (currentProgress < 25) {
        setStep(0);
      } else if (currentProgress < 50) {
        setStep(1);
      } else if (currentProgress < 75) {
        setStep(2);
      } else {
        setStep(3);
      }
    }, 800);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let isActive = true;
    const loadCatalog = async () => {
      setAcademicStatus({ status: "loading", data: null });
      try {
        const response = await getTeacherCatalog(token);
        if (!isActive) return;
        const normalized = normalizeTeacherCatalog(response);
        setClassOptions(normalized.classOptions);
        setAcademicStatus({ status: "success", data: null });
      } catch (error) {
        if (!isActive) return;
        setAcademicStatus({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load academic catalog"
        });
      }
    };
    void loadCatalog();
    return () => {
      isActive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !examForm.classId || !examForm.subjectId) {
      return;
    }

    let isActive = true;

    const loadBooks = async () => {
      try {
        const response = await getAcademicBooksBySubjectId(
          token,
          examForm.classId ?? "",
          examForm.subjectId ?? ""
        );

        if (!isActive) {
          return;
        }

        setNcertBooks(response.ncertBooks);
        setReferenceBooks(response.referenceBooks);
        setExamForm((current) => ({
          ...current,
          ncertBookIds: [],
          referenceBookIds: [],
          ncertChapters: [],
          chapterIds: [],
          bookIds: []
        }));
        setSelectedChapters([]);
        setChapters([]);
      } catch {
        if (!isActive) {
          return;
        }
        setNcertBooks([]);
        setReferenceBooks([]);
        setChapters([]);
      }
    };

    void loadBooks();

    return () => {
      isActive = false;
    };
  }, [token, examForm.classId, examForm.subjectId]);

  useEffect(() => {
    if (
      !token ||
      !examForm.classId ||
      !examForm.subjectId ||
      examForm.mode === "REFERENCE_ONLY" ||
      examForm.ncertBookIds.length === 0
    ) {
      return;
    }

    let isActive = true;

    const loadChapters = async () => {
      try {
        const responses = await Promise.all(
          examForm.ncertBookIds.map((bookId) =>
            getAcademicChapters(token, bookId, examForm.classId ?? "", examForm.subjectId ?? "")
          )
        );
        if (!isActive) {
          return;
        }
        const unique = new Map<string, AcademicChapter>();
        responses.forEach((response) => {
          response.items.forEach((chapter) => {
            if (!unique.has(chapter.id)) {
              unique.set(chapter.id, {
                ...chapter,
                bookName: response.bookName
              });
            }
          });
        });
        setChapters(
          Array.from(unique.values()).sort((left, right) => {
            const leftKey = `${left.bookName ?? ""} ${left.title}`;
            const rightKey = `${right.bookName ?? ""} ${right.title}`;
            return leftKey.localeCompare(rightKey);
          })
        );
      } catch {
        if (!isActive) {
          return;
        }
        setChapters([]);
      }
    };

    void loadChapters();

    return () => {
      isActive = false;
    };
  }, [
    token,
    examForm.classId,
    examForm.subjectId,
    examForm.mode,
    examForm.ncertBookIds
  ]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let isActive = true;
    const loadTemplates = async () => {
      setTemplateStatus({ status: "loading", data: null });
      try {
        const response = await getTemplates(token);
        if (!isActive) return;
        setTemplates(response.items as Array<{ id: string; name: string; sections: ExamTemplateSection[] }>);
        setTemplateStatus({ status: "success", data: null });
      } catch (error) {
        if (!isActive) return;
        setTemplateStatus({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load templates"
        });
      }
    };
    void loadTemplates();
    return () => {
      isActive = false;
    };
  }, [token]);

  const handleMultiSelectChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ): string[] => {
    return Array.from(event.target.selectedOptions).map((option) => option.value);
  };

  const fetchExams = async () => {
    if (!token) return;
    setExamList({ status: "loading", data: null });
    try {
      const response = await getExams(token);
      setExamList({ status: "success", data: response.items });
    } catch (error) {
      setExamList({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load exams"
      });
    }
  };

  const fetchPending = async () => {
    if (!token) return;
    setPendingList({ status: "loading", data: null });
    try {
      const response = await getPendingEvaluations(token);
      setPendingList({ status: "success", data: response.items });
    } catch (error) {
      setPendingList({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load evaluations"
      });
    }
  };

  const handleClassChange = async (sectionId: string) => {
    const selectedOption = classOptions.find((item) => item.id === sectionId);
    setExamForm((current) => ({
      ...current,
      classId: selectedOption?.classId ?? "",
      subject: "",
      subjectId: "",
      sectionId: selectedOption?.sectionId ?? "",
      ncertBookIds: [],
      referenceBookIds: [],
      ncertChapters: [],
      chapterIds: [],
      bookIds: []
    }));
    setClassSubjects([]);
    setSelectedSubjectIds([]);
    setSelectedChapters([]);
    setNcertBooks([]);
    setReferenceBooks([]);
    setChapters([]);

    if (!sectionId) {
      return;
    }

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

  const handleSubjectChange = async (subjectIds: string[]) => {
    const nextSubjectId = subjectIds[0] ?? "";
    const primarySubject = classSubjects.find((item) => item.id === nextSubjectId) ?? null;
    setSelectedSubjectIds(nextSubjectId ? [nextSubjectId] : []);
    setExamForm((current) => ({
      ...current,
      subjectId: primarySubject?.id ?? "",
      subject: primarySubject?.name ?? "",
      ncertBookIds: [],
      referenceBookIds: [],
      ncertChapters: [],
      chapterIds: [],
      bookIds: []
    }));
    setNcertBooks([]);
    setReferenceBooks([]);
    setSelectedChapters([]);
    setChapters([]);
  };

  const handleModeChange = (mode: GenerateExamInput["mode"]) => {
    if (mode === "REFERENCE_ONLY") {
      setExamForm((current) => ({
        ...current,
        mode,
        ncertBookIds: [],
        ncertChapters: [],
        chapterIds: [],
        bookIds: []
      }));
      setSelectedChapters([]);
      setChapters([]);
      return;
    }

    if (mode === "NCERT_ONLY") {
      setExamForm((current) => ({
        ...current,
        mode,
        referenceBookIds: [],
        bookIds: current.ncertBookIds ?? []
      }));
      return;
    }

    setExamForm((current) => ({ ...current, mode }));
  };

  const handleNcertBookChange = async (bookIds: string[]) => {
    setExamForm((current) => ({
      ...current,
      ncertBookIds: bookIds,
      ncertChapters: [],
      chapterIds: [],
      bookIds: [...new Set([...bookIds, ...(current.referenceBookIds ?? [])])]
    }));
    setSelectedChapters([]);
  };

  const handleReferenceBookChange = (bookIds: string[]) => {
    setExamForm((current) => ({
      ...current,
      referenceBookIds: bookIds,
      bookIds: [...new Set([...(current.ncertBookIds ?? []), ...bookIds])]
    }));
  };

  const handleChapterChange = (chapterIds: string[]) => {
    setSelectedChapters(chapterIds);
    setExamForm((current) => ({
      ...current,
      chapterIds,
      ncertChapters: []
    }));
  };

  const isReferenceOnly = examForm.mode === "REFERENCE_ONLY";
  const hasRequiredNcert =
    !isReferenceOnly && examForm.ncertBookIds.length > 0 && (examForm.chapterIds?.length ?? 0) > 0;
  const hasRequiredReferences =
    examForm.mode === "REFERENCE_ONLY" ? (examForm.referenceBookIds?.length ?? 0) > 0 : true;
  const hasPrimarySubject = selectedSubjectIds.length > 0;
  const canGenerateExam =
    canCallApi &&
    isTeacher &&
    Boolean(examForm.classId) &&
    hasPrimarySubject &&
    (isReferenceOnly ? hasRequiredReferences : hasRequiredNcert);
  const selectedClassOptionId = examForm.sectionId || examForm.classId || "";

  const handleGenerateExam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !isTeacher) return;
    if (examForm.mode !== "REFERENCE_ONLY" && selectedChapters.length === 0) {
      window.alert("Please select at least one chapter");
      return;
    }
    setIsGenerating(true);
    setProgress(0);
    setStep(0);
    setExamStatus({ status: "loading", data: null });
    try {
      console.log("Selected Chapters:", selectedChapters);
      const selectedChapterTitles = selectedChapters
        .map((chapterId) => chapters.find((chapter) => chapter.id === chapterId)?.title)
        .filter((title): title is string => Boolean(title));
      const resolvedBookIds =
        examForm.bookIds && examForm.bookIds.length > 0
          ? examForm.bookIds
          : [...(examForm.ncertBookIds ?? []), ...(examForm.referenceBookIds ?? [])];
      const payload: GenerateExamInput = {
        ...examForm,
        sectionId: examForm.sectionId?.trim() || undefined,
        templateId: examForm.templateId?.trim() || undefined,
        subjectIds: selectedSubjectIds,
        subjectId: examForm.subjectId || selectedSubjectIds[0],
        subject:
          selectedSubjectIds.length > 1
            ? classSubjects
                .filter((item) => selectedSubjectIds.includes(item.id))
                .map((item) => item.name)
                .join(" / ")
            : examForm.subject,
        topic: examForm.topic?.trim() || undefined,
        chapterIds: selectedChapters,
        ncertChapters: selectedChapterTitles,
        ncertBookIds: examForm.ncertBookIds ?? [],
        referenceBookIds: examForm.referenceBookIds ?? [],
        bookIds: resolvedBookIds
      };
      console.log("Generating exam with:", payload);
      const response = await generateExam(token, payload);
      setProgress(100);
      setStep(generationSteps.length - 1);
      setExamStatus({ status: "success", data: response });
      setExamForm(defaultExamInput);
      setClassSubjects([]);
      setSelectedSubjectIds([]);
      setSelectedChapters([]);
      setNcertBooks([]);
      setReferenceBooks([]);
      setChapters([]);
      await fetchExams();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      setIsGenerating(false);
      router.push(`/teacher/exams/${response.examId}`);
    } catch (error) {
      setIsGenerating(false);
      setExamStatus({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to generate exam"
      });
    }
  };

  const handleStatusUpdate = async (
    examId: string,
    status: "PUBLISHED" | "ARCHIVED",
    assignedClassId?: string
  ) => {
    if (!token) return;
    setStatusUpdate({ status: "loading", data: null });
    try {
      if (status === "PUBLISHED") {
        if (!assignedClassId) {
          throw new Error("Assigned class is required to publish.");
        }
        const response = await publishExam(token, examId, assignedClassId);
        setStatusUpdate({ status: "success", data: { examId, status: response.status } });
        window.alert("Exam Published");
      } else {
        const response = await archiveExam(token, examId);
        setStatusUpdate({ status: "success", data: { examId, status: response.status } });
      }
      await fetchExams();
    } catch (error) {
      setStatusUpdate({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to update exam status"
      });
    }
  };

  const handleSelectEvaluation = async (item: EvaluationSummary) => {
    if (!token) return;
    setSelectedEvaluation({ status: "loading", data: null });
    try {
      const detail = await getEvaluation(token, item.submissionId);
      setSelectedEvaluation({ status: "success", data: detail });
      setReviewNotes(detail.result?.summary ?? "");
      setReviewScore(detail.score !== null ? String(detail.score) : "");
    } catch (error) {
      setSelectedEvaluation({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load evaluation"
      });
    }
  };

  const reviewedResult = useMemo<EvaluationResult | undefined>(() => {
    const base = selectedEvaluation.data?.result;
    if (!base) return undefined;
    const hasOverride = reviewScore.trim().length > 0;
    const overrideValue = Number(reviewScore);
    return {
      ...base,
      overallScore: hasOverride && Number.isFinite(overrideValue) ? overrideValue : base.overallScore,
      summary: reviewNotes.trim() || base.summary
    };
  }, [reviewNotes, reviewScore, selectedEvaluation.data?.result]);

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (!token || !selectedEvaluation.data) return;
    setReviewStatus({ status: "loading", data: null });
    try {
      const payload = {
        status,
        teacherScore: reviewScore ? Number(reviewScore) : undefined,
        teacherResult: status === "APPROVED" ? reviewedResult : undefined,
        rejectionReason: status === "REJECTED" ? reviewNotes.trim() : undefined
      };
      const updated = await reviewEvaluation(token, selectedEvaluation.data.id, payload);
      setReviewStatus({ status: "success", data: updated });
      await fetchPending();
    } catch (error) {
      setReviewStatus({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to update evaluation"
      });
    }
  };

  const handleLoadAnalytics = async () => {
    if (!token) return;
    setAnalyticsState({ status: "loading", data: null });
    try {
      const payload = await getTeacherAnalytics(token, {
        startDate: analyticsFilters.startDate || undefined,
        endDate: analyticsFilters.endDate || undefined,
        subject: analyticsFilters.subject.trim() || undefined,
        classLevel: analyticsFilters.classLevel
          ? Number(analyticsFilters.classLevel)
          : undefined,
        difficulty: analyticsFilters.difficulty || undefined
      });
      setAnalyticsState({ status: "success", data: payload });
    } catch (error) {
      setAnalyticsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load analytics"
      });
    }
  };

  return (
    <RequireRole roles={["TEACHER"]}>
      <div className="mx-auto grid max-w-6xl gap-10">
        <SectionHeader
          eyebrow="Teacher cockpit"
          title="Generate exams & approve evaluations"
          subtitle="Create new exams, monitor submissions, and curate AI feedback."
        />
        <div className="flex flex-wrap gap-3">
          <Link href="/teacher/evaluations">
            <Button variant="outline">Open evaluations</Button>
          </Link>
          <Link href="/teacher/archived-exams">
            <Button variant="outline">Archived exams</Button>
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="space-y-6">
            <SectionHeader
              eyebrow="New exam"
              title="Create a fresh exam set"
              subtitle="Publish a new AI-generated exam for your class."
            />
            <div className="flex justify-end">
              <Link href="/teacher/templates">
                <Button variant="outline">Manage templates</Button>
              </Link>
            </div>
            <form className="grid gap-4" onSubmit={handleGenerateExam}>
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Class"
                  value={selectedClassOptionId}
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
                  value={selectedSubjectIds[0] ?? ""}
                  onChange={(event) => handleSubjectChange([event.target.value])}
                  disabled={!examForm.classId}
                  required
                >
                  {classSubjects.length === 0 ? (
                    <option value="">Select class to load subjects</option>
                  ) : null}
                  {classSubjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Select
                label="Template"
                value={examForm.templateId ?? ""}
                onChange={(event) => setExamForm({ ...examForm, templateId: event.target.value })}
              >
                <option value="">Default CBSE structure</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Topic focus (optional)"
                helperText="Use for additional focus within the selected chapters."
                value={examForm.topic ?? ""}
                onChange={(event) => setExamForm({ ...examForm, topic: event.target.value })}
              />
              <Select
                label="Language"
                value={examForm.language}
                onChange={(event) =>
                  setExamForm({ ...examForm, language: event.target.value as GenerateExamInput["language"] })
                }
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="punjabi">Punjabi</option>
              </Select>
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Difficulty"
                  value={examForm.difficulty}
                  onChange={(event) =>
                    setExamForm({ ...examForm, difficulty: event.target.value as GenerateExamInput["difficulty"] })
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              </div>
              <Select
                label="Generation mode"
                value={examForm.mode}
                onChange={(event) =>
                  handleModeChange(event.target.value as GenerateExamInput["mode"])
                }
              >
                <option value="NCERT_ONLY">NCERT-only (strict chapters)</option>
                <option value="NCERT_PLUS_REFERENCE">
                  NCERT + reference (chapters locked)
                </option>
                <option value="REFERENCE_ONLY">Reference books only (no chapters)</option>
              </Select>
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="NCERT books"
                  multiple
                  size={Math.min(8, Math.max(3, ncertBooks.length))}
                  value={examForm.ncertBookIds}
                  onChange={(event) => void handleNcertBookChange(handleMultiSelectChange(event))}
                  disabled={selectedSubjectIds.length === 0 || examForm.mode === "REFERENCE_ONLY"}
                >
                  {selectedSubjectIds.length === 0 ? (
                    <option value="">Select subjects to load NCERT books</option>
                  ) : null}
                  {ncertBooks.map((book) => {
                    const subjectLabel =
                      classSubjects.find((subject) => subject.id === book.subjectId)?.name;
                    return (
                      <option key={book.id} value={book.id}>
                        {subjectLabel ? `${book.name} (${subjectLabel})` : book.name}
                      </option>
                    );
                  })}
                </Select>
                <Select
                  label="Reference books"
                  multiple
                  size={Math.min(8, Math.max(3, referenceBooks.length))}
                  value={examForm.referenceBookIds ?? []}
                  onChange={(event) =>
                    handleReferenceBookChange(handleMultiSelectChange(event))
                  }
                  disabled={selectedSubjectIds.length === 0 || examForm.mode === "NCERT_ONLY"}
                >
                  {selectedSubjectIds.length === 0 ? (
                    <option value="">Select subjects to load reference books</option>
                  ) : null}
                  {referenceBooks.map((book) => {
                    const subjectLabel =
                      classSubjects.find((subject) => subject.id === book.subjectId)?.name;
                    return (
                      <option key={book.id} value={book.id}>
                        {subjectLabel ? `${book.name} (${subjectLabel})` : book.name}
                      </option>
                    );
                  })}
                </Select>
              </div>
              <Select
                label="NCERT chapters"
                multiple
                size={Math.min(8, Math.max(4, chapters.length))}
                value={selectedChapters}
                onChange={(event) => handleChapterChange(handleMultiSelectChange(event))}
                disabled={
                  examForm.mode === "REFERENCE_ONLY" ||
                  examForm.ncertBookIds.length === 0
                }
              >
                {chapters.length === 0 ? (
                  <option value="">Select books to load chapters</option>
                ) : null}
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.bookName ? `${chapter.title} (${chapter.bookName})` : chapter.title}
                  </option>
                ))}
              </Select>
              <div className="rounded-2xl border border-border bg-white/70 p-3 text-xs text-ink-soft">
                <p className="font-semibold text-foreground">Syllabus guardrails</p>
                <p className="mt-2">
                  NCERT-only modes require chapter selection from NCERT books. Reference books
                  influence difficulty and style only. Reference-only mode disables chapters
                  entirely.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {isTeacher ? (
                  <Button
                    type="submit"
                    disabled={!canGenerateExam || isGenerating}
                  >
                    {isGenerating ? "Generating..." : "Generate exam"}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={fetchExams} disabled={!canCallApi}>
                  Refresh history
                </Button>
              </div>
              {!canGenerateExam && canCallApi ? (
                <p className="text-xs text-ink-soft">
                  Select class, subject, and required books/chapters before generating.
                </p>
              ) : null}
              {isGenerating ? (
                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-ink-soft">{generationSteps[step]}</p>
                </div>
              ) : null}
              {examStatus.status === "success" && examStatus.data ? (
                <StatusBlock
                  tone="positive"
                  title="Exam created"
                  description={
                    [
                      `Exam ID: ${examStatus.data.examId}`,
                      summarizeNotifications(examStatus.data.notifications)
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
              ) : null}
              {examStatus.status === "error" ? (
                <StatusBlock
                  tone="negative"
                  title="Exam creation failed"
                  description={examStatus.error ?? "Please try again."}
                />
              ) : null}
              {academicStatus.status === "error" ? (
                <StatusBlock
                  tone="negative"
                  title="Academic catalog unavailable"
                  description={academicStatus.error ?? "Please refresh to retry."}
                />
              ) : null}
              {templateStatus.status === "error" ? (
                <StatusBlock
                  tone="negative"
                  title="Templates unavailable"
                  description={templateStatus.error ?? "Please refresh to retry."}
                />
              ) : null}
            </form>
          </Card>

          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Exam history"
              title="Recent exams"
              subtitle="Track the most recent exam generations."
            />
            <Button variant="outline" onClick={fetchExams} disabled={!canCallApi}>
              Load history
            </Button>
            {examList.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading examsâ€¦</p>
            ) : null}
            {examList.status === "error" ? (
              <StatusBlock tone="negative" title="Unable to load" description={examList.error ?? ""} />
            ) : null}
            {examList.data && examList.data.length > 0 ? (
              <div className="space-y-3">
                {examList.data.map((exam) => {
                  const exactClassOption =
                    classOptions.find(
                      (item) =>
                        item.classId === exam.classId &&
                        item.sectionId === (exam.sectionId ?? "")
                    ) ??
                    classOptions.find((item) => item.classId === exam.classId);
                  const publishableClasses = exactClassOption ? [exactClassOption] : [];
                  const publishClassId =
                    publishSelections[exam.id] ??
                    (typeof exam.assignedClassId === "string" ? exam.assignedClassId : "") ??
                    (typeof exam.classId === "string" ? exam.classId : "") ??
                    (publishableClasses[0]?.classId ?? "");
                  return (
                    <div key={exam.id} className="rounded-2xl border border-border bg-white/70 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        {exam.subject ?? "Untitled exam"}
                      </p>
                      <p className="text-xs text-ink-soft">
                        Class {exam.classLevel ?? "â€”"} Â· {exam.difficulty ?? "â€”"} Â·{" "}
                        {new Date(exam.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-2 text-xs text-ink-soft">ID: {exam.id}</p>
                      <p className="mt-2 text-xs text-ink-soft">
                        Status: {exam.status ?? "DRAFT"}{" "}
                        {exam.assignedClassLevel
                          ? `Â· Assigned: Class ${exam.assignedClassLevel}`
                          : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleDownloadPdf(exam.id)}
                          disabled={!canCallApi}
                        >
                          Download PDF
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleDownloadDocx(exam.id)}
                          disabled={!canCallApi}
                        >
                          Download Word
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleDownloadAnswerKey(exam.examPaperId)}
                          disabled={!canCallApi || !exam.examPaperId}
                        >
                          Download Answer Key
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {exam.status === "DRAFT" ? (
                          <>
                            <Select
                              label="Publish to class"
                              value={publishClassId}
                              onChange={(event) =>
                                setPublishSelections({
                                  ...publishSelections,
                                  [exam.id]: event.target.value
                                })
                              }
                            >
                              <option value="">Select class</option>
                              {publishableClasses.map((item) => (
                                <option key={item.classId} value={item.classId}>
                                  {item.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              type="button"
                              onClick={() =>
                                handleStatusUpdate(exam.id, "PUBLISHED", publishClassId)
                              }
                              disabled={
                                !publishClassId ||
                                statusUpdate.status === "loading" ||
                                !canPublishExams
                              }
                            >
                              Publish exam
                            </Button>
                            {!canPublishExams ? (
                              <p className="text-xs text-ink-soft">
                                Independent teachers can generate, preview, and download exams, but publishing is disabled.
                              </p>
                            ) : null}
                          </>
                        ) : null}
                        {exam.status === "PUBLISHED" ? (
                          <div className="flex flex-wrap gap-3">
                            <Button
                              type="button"
                              onClick={() => handleStatusUpdate(exam.id, "ARCHIVED")}
                              disabled={statusUpdate.status === "loading"}
                            >
                              Archive exam
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {statusUpdate.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Status update failed"
                description={statusUpdate.error ?? "Please try again."}
              />
            ) : null}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Pending reviews"
              title="AI evaluations awaiting review"
              subtitle="Open a submission to edit and approve."
            />
            <Button variant="outline" onClick={fetchPending} disabled={!canCallApi}>
              Refresh pending list
            </Button>
            {pendingList.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading pending evaluationsâ€¦</p>
            ) : null}
            {pendingList.status === "error" ? (
              <StatusBlock tone="negative" title="Unable to load" description={pendingList.error ?? ""} />
            ) : null}
            {pendingList.data && pendingList.data.length > 0 ? (
              <div className="space-y-3">
                {pendingList.data.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-2xl border border-border bg-white/70 p-4 text-left transition hover:border-accent"
                    onClick={() => handleSelectEvaluation(item)}
                  >
                    <p className="text-sm font-semibold">Submission {item.submissionId}</p>
                    <p className="text-xs text-ink-soft">
                      Exam {item.examId} Â· Student {item.studentId}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Review panel"
              title="Curate the AI report"
              subtitle="Adjust the score or summary before approval."
            />
            {selectedEvaluation.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading evaluationâ€¦</p>
            ) : null}
            {selectedEvaluation.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Unable to load evaluation"
                description={selectedEvaluation.error ?? ""}
              />
            ) : null}
            {selectedEvaluation.data ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">AI summary</p>
                  <p className="mt-2 text-ink-soft">
                    {selectedEvaluation.data.result?.summary ?? "No summary available."}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft">
                    AI score: {selectedEvaluation.data.score ?? "â€”"}
                  </p>
                </div>
                <Input
                  label="Teacher score override"
                  type="number"
                  value={reviewScore}
                  onChange={(event) => setReviewScore(event.target.value)}
                />
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-medium text-foreground">Teacher summary / rejection note</span>
                  <textarea
                    className="min-h-[120px] rounded-2xl border border-border bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent"
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleReview("APPROVED")}
                    disabled={reviewStatus.status === "loading"}
                  >
                    Approve report
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReview("REJECTED")}
                    disabled={reviewStatus.status === "loading"}
                  >
                    Reject report
                  </Button>
                </div>
                {reviewStatus.status === "success" ? (
                  <StatusBlock
                    tone="positive"
                    title="Review saved"
                    description={
                      [
                        `Status: ${reviewStatus.data?.status ?? ""}`,
                        summarizeNotifications(reviewStatus.data?.notifications)
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  />
                ) : null}
                {reviewStatus.status === "error" ? (
                  <StatusBlock
                    tone="negative"
                    title="Review failed"
                    description={reviewStatus.error ?? ""}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Select a pending evaluation to begin.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Class analytics"
              title="Performance overview"
              subtitle="Filter approved evaluations to understand impact."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Start date"
                type="date"
                value={analyticsFilters.startDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, startDate: event.target.value })
                }
              />
              <Input
                label="End date"
                type="date"
                value={analyticsFilters.endDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, endDate: event.target.value })
                }
              />
              <Input
                label="Subject"
                value={analyticsFilters.subject}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, subject: event.target.value })
                }
              />
              <Input
                label="Class level"
                type="number"
                min={1}
                max={12}
                value={analyticsFilters.classLevel}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, classLevel: event.target.value })
                }
              />
              <Select
                label="Difficulty"
                value={analyticsFilters.difficulty}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, difficulty: event.target.value })
                }
              >
                <option value="">All levels</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </div>
            <Button onClick={handleLoadAnalytics} disabled={!canCallApi}>
              Refresh analytics
            </Button>
            {analyticsState.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading analytics...</p>
            ) : null}
            {analyticsState.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Analytics unavailable"
                description={analyticsState.error ?? ""}
              />
            ) : null}
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Approved evaluations",
                    value: analyticsState.data.summary.totalEvaluations,
                    tone: "accent"
                  },
                  {
                    label: "Unique students",
                    value: analyticsState.data.summary.uniqueStudents
                  },
                  {
                    label: "Average %",
                    value: analyticsState.data.summary.averagePercentage,
                    tone: "cool"
                  }
                ]}
              />
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader eyebrow="Trend" title="Monthly class trend" />
            {analyticsState.data ? (
              <TrendChart
                data={analyticsState.data.recentEvaluations
                  .slice()
                  .reverse()
                  .map((item) => ({
                    label: new Date(item.evaluatedAt).toLocaleDateString(),
                    value: item.percentage ?? 0
                  }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">Load analytics to see progress.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Subjects" title="Subject performance" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.subjectPerformance.map((item, index) => ({
                  label: item.subject,
                  value: item.averagePercentage,
                  suffix: "%",
                  tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                }))}
                maxValue={100}
              />
            ) : (
              <p className="text-sm text-ink-soft">No subject data yet.</p>
            )}
          </Card>
          <Card className="space-y-4">
            <SectionHeader eyebrow="Difficulty" title="Difficulty effectiveness" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.difficultyEffectiveness.map((item, index) => ({
                  label: item.difficulty,
                  value: item.averagePercentage,
                  suffix: "%",
                  tone: index % 2 === 0 ? "cool" : "warm"
                }))}
                maxValue={100}
              />
            ) : (
              <p className="text-sm text-ink-soft">No difficulty data yet.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Topics" title="Topic distribution" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.topicDistribution.map((item) => ({
                  label: item.topic,
                  value: item.count,
                  tone: "accent"
                }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">No topic data yet.</p>
            )}
          </Card>
          <Card className="space-y-4">
            <SectionHeader eyebrow="AI vs Teacher" title="Override metrics" />
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Overrides",
                    value: analyticsState.data.overrideStats.overrideCount,
                    tone: "warm"
                  },
                  {
                    label: "AI only",
                    value: analyticsState.data.overrideStats.aiOnlyCount
                  },
                  {
                    label: "Override rate",
                    value: Math.round(analyticsState.data.overrideStats.overrideRate * 100),
                    tone: "cool"
                  }
                ]}
              />
            ) : (
              <p className="text-sm text-ink-soft">No override data yet.</p>
            )}
          </Card>
        </div>

        <Card className="space-y-4">
          <SectionHeader eyebrow="Report" title="Recent approved evaluations" />
          {analyticsState.data ? (
            <DataTable
              columns={["Exam", "Student", "Subject", "Difficulty", "%", "Evaluated"]}
              rows={analyticsState.data.recentEvaluations.map((row) => [
                row.examId,
                row.studentId,
                row.subject,
                row.difficulty,
                row.percentage ?? "-",
                new Date(row.evaluatedAt).toLocaleDateString()
              ])}
            />
          ) : (
            <p className="text-sm text-ink-soft">No evaluation history available.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}

