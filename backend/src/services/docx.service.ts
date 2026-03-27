import { Document, Packer, Paragraph, TextRun } from "docx";

import type { ExamMetadata, ExamQuestion, ExamSection } from "../types/exam";
import type { AuthUser } from "../types/auth";
import { resolveSchoolBranding } from "./pdf.service";

type DocxExamContext = {
  examId: string;
  metadata: ExamMetadata;
  sections: ExamSection[];
  questions: ExamQuestion[];
};

function orderQuestions(sections: ExamSection[], questions: ExamQuestion[]) {
  const questionMap = new Map<number, ExamQuestion>();
  questions.forEach((question) => questionMap.set(question.number, question));
  const ordered: Array<{ section: ExamSection; items: ExamQuestion[] }> = [];

  sections.forEach((section) => {
    const items = section.questionNumbers
      .map((number) => questionMap.get(number))
      .filter((q): q is ExamQuestion => Boolean(q));
    ordered.push({ section, items });
  });

  return ordered;
}

export async function buildExamDocx(exam: DocxExamContext, user?: AuthUser) {
  const branding = resolveSchoolBranding(user);
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: branding.schoolName, bold: true, size: 28 })],
      spacing: { after: 200 }
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: exam.metadata.subject ?? "Exam", bold: true, size: 24 })],
      spacing: { after: 200 }
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Class ${exam.metadata.classLevel} · ${exam.metadata.difficulty}`, size: 22 })
      ],
      spacing: { after: 300 }
    })
  );

  const ordered = orderQuestions(exam.sections, exam.questions);
  ordered.forEach(({ section, items }) => {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: section.title ?? "Section", bold: true, size: 24 })],
        spacing: { before: 200, after: 150 }
      })
    );

    items.forEach((question) => {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Q${question.number}. `, bold: true }),
            new TextRun({ text: question.prompt ?? "-" })
          ],
          spacing: { after: 120 }
        })
      );

      if (Array.isArray(question.choices)) {
        question.choices.forEach((choice, idx) => {
          const label = String.fromCharCode(65 + idx);
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: `(${label}) ${choice}` })],
              indent: { left: 720 },
              spacing: { after: 80 }
            })
          );
        });
      }
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  return Packer.toBuffer(doc);
}
