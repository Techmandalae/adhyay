import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { HttpError } from "../middleware/error";

export const feedbackRouter = Router();

const createFeedbackSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    rating: z.number().int().min(1).max(5).optional()
  })
  .strict();

feedbackRouter.post("/", async (req, res, next) => {
  const parsed = createFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid feedback payload"));
  }

  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    await prisma.feedback.create({
      data: {
        userId: user.id,
        role: user.role,
        message: parsed.data.message,
        ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {})
      }
    });

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});
