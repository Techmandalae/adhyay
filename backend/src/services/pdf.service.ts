import fs from "fs";
import path from "path";

import type { Response } from "express";
import PDFDocument from "pdfkit";

import type { AuthUser, MetaBlob } from "../types/auth";
import type { EvaluationResult } from "../types/evaluation";
import type { ExamLanguage, ExamMetadata, ExamQuestion, ExamSection } from "../types/exam";

type PdfBranding = {
  schoolName: string;
  logoPath?: string;
};

type PdfExamContext = {
  examId: string;
  metadata: ExamMetadata;
  sections: ExamSection[];
  questions: ExamQuestion[];
};

type FontSelection = {
  body: string;
  bold: string;
};

const HEADER_TOP = 20;
const HEADER_HEIGHT = 56;
const LOGO_SIZE = 40;
const SECTION_SPACING = 8;
const QUESTION_SPACING = 6;
const CHOICE_INDENT = 18;

const WINDOWS_FONT_DIR = "C:\\Windows\\Fonts";
const PDFJS_FONT_DIR = path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
const FRONTEND_NOTO_FONT_DIR = path.resolve(
  process.cwd(),
  "..",
  "frontend",
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@vercel",
  "og"
);

const fontCandidates: Record<ExamLanguage, { regular: string[]; bold: string[] }> = {
  english: {
    regular: [
      path.join(WINDOWS_FONT_DIR, "DejaVuSans.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Regular.ttf"),
      path.join(FRONTEND_NOTO_FONT_DIR, "noto-sans-v27-latin-regular.ttf"),
      path.join(PDFJS_FONT_DIR, "LiberationSans-Regular.ttf")
    ],
    bold: [
      path.join(WINDOWS_FONT_DIR, "DejaVuSans-Bold.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Bold.ttf"),
      path.join(PDFJS_FONT_DIR, "LiberationSans-Bold.ttf")
    ]
  },
  hindi: {
    regular: [
      path.join(WINDOWS_FONT_DIR, "Nirmala.ttf"),
      path.join(WINDOWS_FONT_DIR, "Mangal.ttf"),
      path.join(WINDOWS_FONT_DIR, "DejaVuSans.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Regular.ttf"),
      "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
      "/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.ttf",
      "/System/Library/Fonts/KohinoorDevanagari-Regular.ttf",
      path.join(PDFJS_FONT_DIR, "LiberationSans-Regular.ttf")
    ],
    bold: [
      path.join(WINDOWS_FONT_DIR, "NirmalaB.ttf"),
      path.join(WINDOWS_FONT_DIR, "Mangalb.ttf"),
      path.join(WINDOWS_FONT_DIR, "DejaVuSans-Bold.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Bold.ttf"),
      "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf",
      "/usr/share/fonts/opentype/noto/NotoSansDevanagari-Bold.ttf",
      "/System/Library/Fonts/KohinoorDevanagari-Semibold.ttf",
      path.join(PDFJS_FONT_DIR, "LiberationSans-Bold.ttf")
    ]
  },
  punjabi: {
    regular: [
      path.join(WINDOWS_FONT_DIR, "Nirmala.ttf"),
      path.join(WINDOWS_FONT_DIR, "Raavi.ttf"),
      path.join(WINDOWS_FONT_DIR, "DejaVuSans.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Regular.ttf"),
      "/usr/share/fonts/truetype/noto/NotoSansGurmukhi-Regular.ttf",
      "/usr/share/fonts/opentype/noto/NotoSansGurmukhi-Regular.ttf",
      "/System/Library/Fonts/GurmukhiMN.ttf",
      path.join(PDFJS_FONT_DIR, "LiberationSans-Regular.ttf")
    ],
    bold: [
      path.join(WINDOWS_FONT_DIR, "NirmalaB.ttf"),
      path.join(WINDOWS_FONT_DIR, "Raavib.ttf"),
      path.join(WINDOWS_FONT_DIR, "DejaVuSans-Bold.ttf"),
      path.join(WINDOWS_FONT_DIR, "NotoSans-Bold.ttf"),
      "/usr/share/fonts/truetype/noto/NotoSansGurmukhi-Bold.ttf",
      "/usr/share/fonts/opentype/noto/NotoSansGurmukhi-Bold.ttf",
      "/System/Library/Fonts/GurmukhiMN-Bold.ttf",
      path.join(PDFJS_FONT_DIR, "LiberationSans-Bold.ttf")
    ]
  }
};

function pickFirstExisting(paths: string[]): string | undefined {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function setupFonts(doc: PDFDocument, language: ExamLanguage): FontSelection {
  const candidates = fontCandidates[language];
  const regularPath = pickFirstExisting(candidates.regular);
  const boldPath = pickFirstExisting(candidates.bold);

  if (regularPath) {
    doc.registerFont("Custom", regularPath);
  }
  if (boldPath) {
    doc.registerFont("CustomBold", boldPath);
  }

  const body = regularPath ? "Custom" : "Times-Roman";
  const bold = boldPath ? "CustomBold" : body;

  return { body, bold };
}

function resolveLogoPath(meta?: MetaBlob): string | undefined {
  if (!meta) return undefined;
  const record = meta as Record<string, unknown>;
  const candidate =
    (typeof record.logoPath === "string" && record.logoPath.trim()) ||
    (typeof record.logoFile === "string" && record.logoFile.trim()) ||
    (typeof record.logo === "string" && record.logo.trim()) ||
    (typeof record.schoolLogo === "string" && record.schoolLogo.trim()) ||
    (typeof record.brandLogo === "string" && record.brandLogo.trim()) ||
    undefined;

  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) {
    return undefined;
  }

  const resolved = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate);

  return fs.existsSync(resolved) ? resolved : undefined;
}

function resolveSchoolName(meta?: MetaBlob): string | undefined {
  if (!meta) return undefined;
  const record = meta as Record<string, unknown>;
  if (typeof record.schoolName === "string" && record.schoolName.trim()) {
    return record.schoolName.trim();
  }
  if (typeof record.name === "string" && record.name.trim()) {
    return record.name.trim();
  }
  if (typeof record.title === "string" && record.title.trim()) {
    return record.title.trim();
  }
  return undefined;
}

export function resolveSchoolBranding(user?: AuthUser, overrides?: { schoolName?: string; logoPath?: string }): PdfBranding {
  const meta = user?.school?.meta ?? user?.schoolMeta;
  const schoolName = overrides?.schoolName ?? resolveSchoolName(meta) ?? "Adhyay";
  const logoPath = overrides?.logoPath ?? resolveLogoPath(meta);
  return { schoolName, ...(logoPath ? { logoPath } : {}) };
}

function formatLanguageLabel(language: ExamLanguage) {
  switch (language) {
    case "hindi":
      return "Hindi";
    case "punjabi":
      return "Punjabi";
    default:
      return "English";
  }
}

function safeText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  return cleanQuestion(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function cleanQuestion(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFFFD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function drawHeader(doc: PDFDocument, fonts: FontSelection, branding: PdfBranding) {
  const { left, right } = doc.page.margins;
  const top = HEADER_TOP;
  let textX = left;

  if (branding.logoPath) {
    try {
      doc.image(branding.logoPath, left, top, {
        fit: [LOGO_SIZE, LOGO_SIZE],
        align: "left",
        valign: "top"
      });
      textX = left + LOGO_SIZE + 10;
    } catch (_error) {
      textX = left;
    }
  }

  const schoolName = cleanQuestion(branding.schoolName);
  doc
    .font(fonts.bold)
    .fontSize(16)
    .fillColor("#111111")
    .text(schoolName, textX, top + 8, {
      align: "left",
      width: doc.page.width - right - textX
    });

  const ruleY = top + HEADER_HEIGHT;
  doc
    .moveTo(left, ruleY)
    .lineTo(doc.page.width - right, ruleY)
    .lineWidth(0.5)
    .strokeColor("#999999")
    .stroke();

  doc.y = ruleY + 12;
}

function drawHeaderWithSubject(
  doc: PDFDocument,
  fonts: FontSelection,
  branding: PdfBranding,
  metadata: ExamMetadata
) {
  const { left, right } = doc.page.margins;
  const top = HEADER_TOP;
  const centerWidth = doc.page.width - left - right;

  if (branding.logoPath) {
    try {
      doc.image(branding.logoPath, left, top, {
        fit: [LOGO_SIZE, LOGO_SIZE],
        align: "left",
        valign: "top"
      });
    } catch (_error) {
      // no-op
    }
  }

  const schoolName = cleanQuestion(branding.schoolName);
  const cleanedSubject = cleanQuestion(metadata.subject ?? "Exam");
  const cleanedClass = cleanQuestion(String(metadata.classLevel ?? "-"));
  doc
    .font(fonts.bold)
    .fontSize(16)
    .fillColor("#111111")
    .text(schoolName, left, top + 4, {
      align: "center",
      width: centerWidth
    });

  doc
    .font(fonts.body)
    .fontSize(10)
    .fillColor("#111111")
    .text(`Subject: ${cleanedSubject}`, left, top + 26, {
      align: "center",
      width: centerWidth
    });

  doc
    .font(fonts.body)
    .fontSize(10)
    .fillColor("#111111")
    .text(`Class: ${cleanedClass}`, left, top + 40, {
      align: "center",
      width: centerWidth
    });

  const ruleY = top + HEADER_HEIGHT;
  doc
    .moveTo(left, ruleY)
    .lineTo(doc.page.width - right, ruleY)
    .lineWidth(0.5)
    .strokeColor("#999999")
    .stroke();

  doc.y = ruleY + 12;
}

function renderMetadataBlock(
  doc: PDFDocument,
  fonts: FontSelection,
  metadata: ExamMetadata
) {
  doc.fontSize(10);

  const rows: Array<[string, string]> = [
    ["Subject", safeText(metadata.subject, "Exam")],
    ["Class", String(metadata.classLevel ?? "-")]
  ];

  for (const [label, value] of rows) {
    doc
      .font(fonts.bold)
      .fillColor("#222222")
      .text(`${label}: `, { continued: true });
    doc
      .font(fonts.body)
      .fillColor("#111111")
      .text(value);
  }

  doc.moveDown(0.6);
}

function renderClassSubjectLine(
  doc: PDFDocument,
  fonts: FontSelection,
  metadata: ExamMetadata
) {
  const classLabel = `Class ${String(metadata.classLevel ?? "-")}`;
  const subjectLabel = safeText(metadata.subject, "Exam");

  doc
    .font(fonts.bold)
    .fontSize(12)
    .fillColor("#111111")
    .text(`${classLabel} | ${subjectLabel}`);

  doc.moveDown(0.6);
}

function renderSectionTitle(doc: PDFDocument, fonts: FontSelection, title: string) {
  doc
    .font(fonts.bold)
    .fontSize(12)
    .fillColor("#111111")
    .text(cleanQuestion(title));
  doc.moveDown(0.3);
}

function questionChoiceLabel(index: number) {
  const alpha = String.fromCharCode(65 + index);
  return `${alpha})`;
}

function renderQuestion(doc: PDFDocument, fonts: FontSelection, question: ExamQuestion) {
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor("#111111")
    .text(`Q${question.number}. `, { continued: true });
  doc
    .font(fonts.body)
    .fontSize(11)
    .text(cleanQuestion(question.prompt ?? "-"));

  if (Array.isArray(question.choices)) {
    question.choices.forEach((choice, index) => {
      doc
        .font(fonts.body)
        .fontSize(10)
        .text(`${questionChoiceLabel(index)} ${cleanQuestion(choice)}`, {
          indent: CHOICE_INDENT
        });
    });
  }

  doc.moveDown(QUESTION_SPACING / 10);
}

function renderAnswerKeyQuestion(
  doc: PDFDocument,
  fonts: FontSelection,
  question: ExamQuestion,
  evaluation?: EvaluationResult
) {
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor("#111111")
    .text(`Q${question.number}. `, { continued: true });
  doc
    .font(fonts.body)
    .fontSize(11)
    .text(cleanQuestion(question.prompt ?? "-"));

  const answerIndex =
    typeof question.answerIndex === "number" ? question.answerIndex : null;
  const answerChoice =
    answerIndex !== null && question.choices?.[answerIndex]
      ? `${questionChoiceLabel(answerIndex)} ${cleanQuestion(question.choices[answerIndex])}`
      : "Answer not available";

  doc
    .font(fonts.bold)
    .fontSize(10)
    .fillColor("#333333")
    .text("Answer: ", { continued: true, indent: CHOICE_INDENT });
  doc
    .font(fonts.body)
    .fontSize(10)
    .text(answerChoice);

  if (typeof question.explanation === "string" && question.explanation.trim()) {
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor("#333333")
      .text("Explanation: ", { continued: true, indent: CHOICE_INDENT });
    doc
      .font(fonts.body)
      .fontSize(10)
      .text(cleanQuestion(question.explanation));
  }

  if (evaluation) {
    const perQuestion = evaluation.perQuestion.find(
      (entry) => entry.questionNumber === question.number
    );
    if (perQuestion) {
      doc
        .font(fonts.bold)
        .fontSize(9)
        .fillColor("#333333")
        .text("Evaluation: ", { continued: true, indent: CHOICE_INDENT });
      doc
        .font(fonts.body)
        .fontSize(9)
        .text(cleanQuestion(`Score ${perQuestion.score}/${perQuestion.maxScore} - ${perQuestion.remarks}`));
      doc
        .font(fonts.body)
        .fontSize(9)
        .text(cleanQuestion(`Detected: ${perQuestion.detectedAnswer}`), {
          indent: CHOICE_INDENT
        });
    }
  }

  doc.moveDown(QUESTION_SPACING / 10);
}

function normalizeSections(
  sections: ExamSection[],
  questions: ExamQuestion[]
): ExamSection[] {
  if (sections.length > 0) {
    return sections;
  }
  const questionNumbers = questions.map((q) => q.number);
  return [
    {
      sectionNumber: 1,
      title: "Section A",
      questionNumbers
    }
  ];
}

function orderQuestionsBySections(
  sections: ExamSection[],
  questions: ExamQuestion[]
): Array<{ section: ExamSection; questions: ExamQuestion[] }> {
  const questionMap = new Map<number, ExamQuestion>();
  for (const question of questions) {
    questionMap.set(question.number, question);
  }

  return sections.map((section) => {
    const orderedQuestions = (section.questionNumbers ?? [])
      .map((number) => questionMap.get(number))
      .filter((value): value is ExamQuestion => Boolean(value));
    return { section, questions: orderedQuestions };
  });
}

function renderTitle(doc: PDFDocument, fonts: FontSelection, title: string) {
  doc
    .font(fonts.bold)
    .fontSize(18)
    .fillColor("#111111")
    .text(cleanQuestion(title), { align: "left" });
  doc.moveDown(0.4);
}

function renderEvaluationSummary(
  doc: PDFDocument,
  fonts: FontSelection,
  evaluation: EvaluationResult
) {
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor("#111111")
    .text("Evaluation Summary");

  doc
    .font(fonts.body)
    .fontSize(10)
    .text(cleanQuestion(`Score: ${evaluation.overallScore}/${evaluation.maxScore} - ${evaluation.summary}`));
  doc.moveDown(0.4);
}

function createPdfDocument(language: ExamLanguage) {
  const doc = new PDFDocument({ size: "A4", margin: 54 });
  const fonts = setupFonts(doc, language);
  return { doc, fonts };
}

export function streamQuestionPaperPdf(
  res: Response,
  payload: {
    exam: PdfExamContext;
    branding: PdfBranding;
  }
) {
  const { doc, fonts } = createPdfDocument(payload.exam.metadata.language);

  doc.pipe(res);

  const renderHeaderBound = () => drawHeader(doc, fonts, payload.branding);
  renderHeaderBound();
  doc.on("pageAdded", renderHeaderBound);

  renderTitle(doc, fonts, "Question Paper");
  renderMetadataBlock(doc, fonts, payload.exam.metadata);

  const sections = normalizeSections(payload.exam.sections, payload.exam.questions);
  const ordered = orderQuestionsBySections(sections, payload.exam.questions);

  for (const entry of ordered) {
    renderSectionTitle(doc, fonts, entry.section.title);
    for (const question of entry.questions) {
      renderQuestion(doc, fonts, question);
    }
    doc.moveDown(SECTION_SPACING / 10);
  }

  doc.end();
}

export function streamAnswerKeyPdf(
  res: Response,
  payload: {
    exam: PdfExamContext;
    branding: PdfBranding;
    evaluation?: EvaluationResult | null;
  }
) {
  const { doc, fonts } = createPdfDocument(payload.exam.metadata.language);

  doc.pipe(res);

  const renderHeaderBound = () => drawHeader(doc, fonts, payload.branding);
  renderHeaderBound();
  doc.on("pageAdded", renderHeaderBound);

  renderTitle(doc, fonts, "Answer Key");
  renderMetadataBlock(doc, fonts, payload.exam.metadata);

  if (payload.evaluation) {
    renderEvaluationSummary(doc, fonts, payload.evaluation);
  }

  const sections = normalizeSections(payload.exam.sections, payload.exam.questions);
  const ordered = orderQuestionsBySections(sections, payload.exam.questions);

  for (const entry of ordered) {
    renderSectionTitle(doc, fonts, entry.section.title);
    for (const question of entry.questions) {
      renderAnswerKeyQuestion(doc, fonts, question, payload.evaluation ?? undefined);
    }
    doc.moveDown(SECTION_SPACING / 10);
  }

  doc.end();
}

export function streamExamPdf(
  res: Response,
  payload: {
    exam: PdfExamContext;
    branding: PdfBranding;
  }
) {
  const { doc, fonts } = createPdfDocument(payload.exam.metadata.language);

  doc.pipe(res);

  const renderHeaderBound = () => drawHeader(doc, fonts, payload.branding);
  renderHeaderBound();
  doc.on("pageAdded", renderHeaderBound);

  renderClassSubjectLine(doc, fonts, payload.exam.metadata);

  const sections = normalizeSections(payload.exam.sections, payload.exam.questions);
  const ordered = orderQuestionsBySections(sections, payload.exam.questions);

  for (const entry of ordered) {
    const marksLabel =
      typeof entry.section.marksPerQuestion === "number"
        ? ` (Marks/Q: ${entry.section.marksPerQuestion})`
        : "";
    renderSectionTitle(doc, fonts, `${entry.section.title}${marksLabel}`);
    for (const question of entry.questions) {
      renderQuestion(doc, fonts, question);
    }
    doc.moveDown(SECTION_SPACING / 10);
  }

  doc.end();
}
