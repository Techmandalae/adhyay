"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from "@/lib/api";
import type { ExamTemplateSection } from "@/types/exam";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

type EditableTemplate = {
  name: string;
  sections: ExamTemplateSection[];
};

const SECTION_TYPES: Array<ExamTemplateSection["type"]> = [
  "mcq",
  "very_short",
  "short",
  "long",
  "fill_in_the_blanks"
];

const defaultSection: ExamTemplateSection = {
  title: "Section A",
  type: "mcq",
  questionsToGenerate: 10,
  questionsToAttempt: 10,
  marksPerQuestion: 1
};

function formatSectionType(type: ExamTemplateSection["type"]) {
  switch (type) {
    case "mcq":
      return "MCQ";
    case "very_short":
      return "Very Short";
    case "short":
      return "Short";
    case "long":
      return "Long";
    case "fill_in_the_blanks":
      return "Fill in the Blanks";
    default:
      return type;
  }
}

function normalizeSectionType(type: unknown): ExamTemplateSection["type"] {
  if (typeof type !== "string") {
    return "short";
  }

  const normalized = type.trim().toLowerCase();
  if (normalized === "mcq") return "mcq";
  if (normalized === "very_short" || normalized === "very short") return "very_short";
  if (normalized === "short_answer" || normalized === "short answer" || normalized === "short") {
    return "short";
  }
  if (normalized === "long_answer" || normalized === "long answer" || normalized === "long") {
    return "long";
  }
  if (
    normalized === "fill_in_the_blanks" ||
    normalized === "fill in the blanks" ||
    normalized === "fib"
  ) {
    return "fill_in_the_blanks";
  }
  return "short";
}

function normalizeSections(sections: unknown): ExamTemplateSection[] {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections.map((section, index) => {
    const record = (section ?? {}) as Partial<ExamTemplateSection> & Record<string, unknown>;
    return {
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title
          : `Section ${String.fromCharCode(65 + index)}`,
      type: normalizeSectionType(record.type),
      questionsToGenerate:
        typeof record.questionsToGenerate === "number" ? record.questionsToGenerate : 1,
      questionsToAttempt:
        typeof record.questionsToAttempt === "number" ? record.questionsToAttempt : 1,
      marksPerQuestion:
        typeof record.marksPerQuestion === "number" ? record.marksPerQuestion : 1
    };
  });
}

export default function TeacherTemplatesPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [templatesState, setTemplatesState] = useState<AsyncState<any[]>>({
    status: "idle",
    data: null
  });
  const [createName, setCreateName] = useState("");
  const [createSections, setCreateSections] = useState<ExamTemplateSection[]>([
    { ...defaultSection }
  ]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [editState, setEditState] = useState<Record<string, EditableTemplate>>({});
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    const load = async () => {
      setTemplatesState({ status: "loading", data: null });
      try {
        const response = await getTemplates(token);
        if (!isActive) return;
        setTemplatesState({ status: "success", data: response.items });
        const map: Record<string, EditableTemplate> = {};
        response.items.forEach((item: any) => {
          map[item.id] = {
            name: item.name,
            sections: normalizeSections(item.sections)
          };
        });
        setEditState(map);
      } catch (error) {
        if (!isActive) return;
        setTemplatesState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load templates"
        });
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [token]);

  const updateCreateSection = (index: number, patch: Partial<ExamTemplateSection>) => {
    setCreateSections((prev) =>
      prev.map((section, idx) => (idx === index ? { ...section, ...patch } : section))
    );
  };

  const updateEditSection = (
    templateId: string,
    index: number,
    patch: Partial<ExamTemplateSection>
  ) => {
    setEditState((prev) => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        sections: prev[templateId].sections.map((section, idx) =>
          idx === index ? { ...section, ...patch } : section
        )
      }
    }));
  };

  const handleCreate = async () => {
    if (!token) return;
    setCreateError(null);
    setCreateSuccess(false);
    try {
      if (!createName.trim()) {
        throw new Error("Template name is required.");
      }
      if (createSections.length === 0) {
        throw new Error("Add at least one section.");
      }
      await createTemplate(token, { name: createName.trim(), sections: createSections });
      setCreateName("");
      setCreateSections([{ ...defaultSection }]);
      setCreateSuccess(true);
      const response = await getTemplates(token);
      setTemplatesState({ status: "success", data: response.items });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create template");
    }
  };

  const handleUpdate = async (templateId: string) => {
    if (!token) return;
    const entry = editState[templateId];
    if (!entry) return;
    try {
      if (!entry.name.trim()) {
        throw new Error("Template name is required.");
      }
      if (entry.sections.length === 0) {
        throw new Error("Add at least one section.");
      }
      await updateTemplate(token, templateId, {
        name: entry.name.trim(),
        sections: entry.sections
      });
      setEditSuccess("Template saved successfully.");
      const response = await getTemplates(token);
      setTemplatesState({ status: "success", data: response.items });
    } catch (error) {
      setTemplatesState({
        status: "error",
        data: templatesState.data,
        error: error instanceof Error ? error.message : "Failed to update template"
      });
    }
  };

  const handleDuplicate = async (templateId: string) => {
    if (!token) return;
    const entry = editState[templateId];
    if (!entry) return;
    try {
      await createTemplate(token, {
        name: `${entry.name.trim()} Copy`,
        sections: entry.sections
      });
      const response = await getTemplates(token);
      setTemplatesState({ status: "success", data: response.items });
    } catch (error) {
      setTemplatesState({
        status: "error",
        data: templatesState.data,
        error: error instanceof Error ? error.message : "Failed to duplicate template"
      });
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!token) return;
    try {
      await deleteTemplate(token, templateId);
      const response = await getTemplates(token);
      setTemplatesState({ status: "success", data: response.items });
    } catch (error) {
      setTemplatesState({
        status: "error",
        data: templatesState.data,
        error: error instanceof Error ? error.message : "Failed to delete template"
      });
    }
  };

  const templates = useMemo(() => templatesState.data ?? [], [templatesState.data]);

  return (
    <RequireRole roles={["TEACHER"]}>
      <div className="mx-auto grid max-w-5xl gap-8">
        <SectionHeader
          eyebrow="Templates"
          title="Exam template library"
          subtitle="Build templates with section rules and reuse them across exams."
        />

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="New template"
            title="Create a template"
            subtitle="Add sections using the dropdown builder."
          />
          <Input
            label="Template name"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
          />
          <div className="space-y-4">
            {createSections.map((section, index) => (
              <div key={`create-section-${index}`} className="rounded-2xl border border-border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Section title"
                    value={section.title}
                    onChange={(event) => updateCreateSection(index, { title: event.target.value })}
                  />
                  <Select
                    label="Question type"
                    value={section.type}
                    onChange={(event) =>
                      updateCreateSection(index, { type: event.target.value as ExamTemplateSection["type"] })
                    }
                  >
                    {SECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {formatSectionType(type)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Questions to generate"
                    type="number"
                    min={1}
                    value={section.questionsToGenerate}
                    onChange={(event) =>
                      updateCreateSection(index, { questionsToGenerate: Number(event.target.value) })
                    }
                  />
                  <Input
                    label="Questions to attempt"
                    type="number"
                    min={1}
                    value={section.questionsToAttempt}
                    onChange={(event) =>
                      updateCreateSection(index, { questionsToAttempt: Number(event.target.value) })
                    }
                  />
                  <Input
                    label="Marks per question"
                    type="number"
                    min={1}
                    value={section.marksPerQuestion}
                    onChange={(event) =>
                      updateCreateSection(index, { marksPerQuestion: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCreateSections((prev) => prev.filter((_item, idx) => idx !== index))
                    }
                    disabled={createSections.length <= 1}
                  >
                    Remove section
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setCreateSections((prev) => [...prev, { ...defaultSection }])}
          >
            Add Section
          </Button>
          {createError ? (
            <StatusBlock tone="negative" title="Template error" description={createError} />
          ) : null}
          {createSuccess ? (
            <StatusBlock
              tone="positive"
              title="Template saved successfully."
              description="Ready to use in exam generation."
            />
          ) : null}
          <Button onClick={handleCreate} disabled={!token || !createName.trim()}>
            Create template
          </Button>
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Library"
            title="Saved templates"
            subtitle="Edit, duplicate, delete, or use a template."
          />
          {templatesState.status === "loading" ? (
            <p className="text-sm text-ink-soft">Loading templates…</p>
          ) : null}
          {templatesState.status === "error" ? (
            <StatusBlock
              tone="negative"
              title="Template load failed"
              description={templatesState.error ?? ""}
            />
          ) : null}
          {editSuccess ? (
            <StatusBlock tone="positive" title={editSuccess} description="Changes saved." />
          ) : null}
          {templates.length === 0 ? (
            <p className="text-sm text-ink-soft">No templates yet.</p>
          ) : (
            <div className="grid gap-4">
              {templates.map((template: any) => (
                <div key={template.id} className="rounded-2xl border border-border bg-white/70 p-4">
                  <Input
                    label="Name"
                    value={editState[template.id]?.name ?? template.name}
                    onChange={(event) =>
                      setEditState({
                        ...editState,
                        [template.id]: {
                          name: event.target.value,
                          sections: editState[template.id]?.sections ?? template.sections ?? []
                        }
                      })
                    }
                  />
                  <div className="mt-3 space-y-4">
                    {(editState[template.id]?.sections ?? template.sections ?? []).map(
                      (section: ExamTemplateSection, index: number) => (
                        <div key={`${template.id}-section-${index}`} className="rounded-2xl border border-border p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              label="Section title"
                              value={section.title}
                              onChange={(event) =>
                                updateEditSection(template.id, index, { title: event.target.value })
                              }
                            />
                            <Select
                              label="Question type"
                              value={section.type}
                              onChange={(event) =>
                                updateEditSection(template.id, index, {
                                  type: event.target.value as ExamTemplateSection["type"]
                                })
                              }
                            >
                              {SECTION_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {formatSectionType(type)}
                                </option>
                              ))}
                            </Select>
                            <Input
                              label="Questions to generate"
                              type="number"
                              min={1}
                              value={section.questionsToGenerate}
                              onChange={(event) =>
                                updateEditSection(template.id, index, {
                                  questionsToGenerate: Number(event.target.value)
                                })
                              }
                            />
                            <Input
                              label="Questions to attempt"
                              type="number"
                              min={1}
                              value={section.questionsToAttempt}
                              onChange={(event) =>
                                updateEditSection(template.id, index, {
                                  questionsToAttempt: Number(event.target.value)
                                })
                              }
                            />
                            <Input
                              label="Marks per question"
                              type="number"
                              min={1}
                              value={section.marksPerQuestion}
                              onChange={(event) =>
                                updateEditSection(template.id, index, {
                                  marksPerQuestion: Number(event.target.value)
                                })
                              }
                            />
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="outline"
                              onClick={() =>
                                setEditState((prev) => ({
                                  ...prev,
                                  [template.id]: {
                                    ...prev[template.id],
                                    sections: prev[template.id].sections.filter((_, idx) => idx !== index)
                                  }
                                }))
                              }
                              disabled={(editState[template.id]?.sections ?? template.sections ?? []).length <= 1}
                            >
                              Remove section
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditState((prev) => ({
                          ...prev,
                          [template.id]: {
                            ...prev[template.id],
                            sections: [...prev[template.id].sections, { ...defaultSection }]
                          }
                        }))
                      }
                    >
                      Add Section
                    </Button>
                    <Button onClick={() => handleUpdate(template.id)} disabled={!token}>
                      Save changes
                    </Button>
                    <Button variant="outline" onClick={() => handleDuplicate(template.id)} disabled={!token}>
                      Duplicate
                    </Button>
                    <Button variant="outline" onClick={() => handleDelete(template.id)} disabled={!token}>
                      Delete
                    </Button>
                    <Button variant="ghost" onClick={() => router.push(`/teacher?templateId=${template.id}`)}>
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}

