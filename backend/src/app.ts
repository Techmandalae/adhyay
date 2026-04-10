import cors from "cors";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";
import helmet from "helmet";

import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { analyticsRouter } from "./routes/analytics";
import academicRouter, { catalogRouter } from "./routes/academic";
import { adminRouter } from "./routes/admin";
import { examsRouter } from "./routes/exams";
import { feedbackRouter } from "./routes/feedback";
import { healthRouter } from "./routes/health";
import { parentRouter } from "./routes/parent";
import { platformRouter } from "./routes/platform";
import { profileRouter } from "./routes/profile";
import { submissionsRouter } from "./routes/submissions";
import { teacherRouter, templateRouter } from "./routes/teacher";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const fixedOrigins = ["https://adhyay.techmandalae.com"];
  const originPatterns = [/^https:\/\/[a-z0-9-]+\.vercel\.app$/i];
  const configuredOrigins = env.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const allowedOrigins = Array.from(new Set([...localOrigins, ...fixedOrigins, ...configuredOrigins]));
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.includes(origin) ||
        originPatterns.some((pattern) => pattern.test(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200
  };

  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(helmet());
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true }));

  const ipLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  });

  const userLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const fallback = ipKeyGenerator(req.ip ?? "unknown");
      const header = req.headers.authorization;
      if (!header) {
        return fallback;
      }
      const [scheme, token] = header.split(" ");
      if (!token || scheme?.toLowerCase() !== "bearer") {
        return fallback;
      }
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (typeof decoded === "string") {
          return fallback;
        }
        const userId = decoded.id ?? decoded.teacherId ?? decoded.studentId;
        return userId ? `user:${userId}` : fallback;
      } catch (_error) {
        return fallback;
      }
    }
  });

  app.use(ipLimiter);
  app.use(userLimiter);

  app.get("/", (_req, res) => {
    res.status(200).json({ message: "Adhyay API" });
  });

  app.use(healthRouter);

  // PUBLIC ROUTES FIRST
  app.use("/auth", authRouter);

  // THEN apply authentication middleware
  app.use(requireAuth);

  // THEN protected routes
  app.use("/admin", adminRouter);
  app.use("/teacher", teacherRouter);
  app.use("/templates", templateRouter);
  app.use("/parent", parentRouter);
  app.use("/platform", platformRouter);
  app.use("/profile", profileRouter);
  app.use("/academic", academicRouter);
  app.use("/exams", examsRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/feedback", feedbackRouter);
  app.use(catalogRouter);
  app.use(submissionsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
