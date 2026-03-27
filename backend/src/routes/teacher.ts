import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { requireTeacher } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const teacherRouter = Router();
export const templateRouter = Router();

teacherRouter.use(requireTeacher);

const normalizedTemplateType = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
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
  return normalized;
}, z.enum(["mcq", "very_short", "short", "long", "fill_in_the_blanks"]));

const templateSectionSchema = z
  .object({
    title: z.string().min(1),
    type: normalizedTemplateType,
    questionsToGenerate: z.coerce.number().int().positive(),
    questionsToAttempt: z.coerce.number().int().positive(),
    marksPerQuestion: z.coerce.number().positive()
  })
  .strict();

const templateSchema = z
  .object({
    name: z.string().trim().min(1),
    sections: z.array(templateSectionSchema).min(1)
  })
  .strict();

async function createTemplateHandler(req: any, res: any, next: any) {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid template payload"));
  }
  try {
    const user = req.user;
    if (!user?.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const created = await prisma.examTemplate.create({
      data: {
        schoolId: user.schoolId,
        name: parsed.data.name,
        sections: parsed.data.sections,
        createdById: user.teacherId
      }
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

teacherRouter.post("/templates", createTemplateHandler);
templateRouter.post("/", createTemplateHandler);

async function listTemplatesHandler(req: any, res: any, next: any) {
  try {
    const user = req.user;
    if (!user?.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const items = await prisma.examTemplate.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

teacherRouter.get("/templates", listTemplatesHandler);
templateRouter.get("/", listTemplatesHandler);

async function updateTemplateHandler(req: any, res: any, next: any) {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid template payload"));
  }
  try {
    const user = req.user;
    if (!user?.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const existing = await prisma.examTemplate.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId, createdById: user.teacherId }
    });
    if (!existing) {
      return next(new HttpError(404, "Template not found"));
    }
    const updated = await prisma.examTemplate.update({
      where: { id: existing.id },
      data: { name: parsed.data.name, sections: parsed.data.sections }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

teacherRouter.put("/templates/:id", updateTemplateHandler);
templateRouter.put("/:id", updateTemplateHandler);

async function deleteTemplateHandler(req: any, res: any, next: any) {
  try {
    const user = req.user;
    if (!user?.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const existing = await prisma.examTemplate.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId, createdById: user.teacherId }
    });
    if (!existing) {
      return next(new HttpError(404, "Template not found"));
    }
    await prisma.examTemplate.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

teacherRouter.delete("/templates/:id", deleteTemplateHandler);
templateRouter.delete("/:id", deleteTemplateHandler);
