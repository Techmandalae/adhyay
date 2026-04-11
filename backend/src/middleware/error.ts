import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Not Found"));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const isMulterError = err.name === "MulterError";
  const multerErrorCode = isMulterError ? (err as Error & { code?: string }).code : undefined;
  const status =
    err instanceof HttpError
      ? err.status
      : isMulterError
        ? multerErrorCode === "LIMIT_FILE_SIZE"
          ? 400
          : 400
        : 500;
  const message =
    isMulterError && multerErrorCode === "LIMIT_FILE_SIZE"
      ? "File too large (max 2MB)"
      : err.message || "Internal Server Error";
  const payload = {
    error: {
      status,
      message,
      ...(err instanceof HttpError && err.details ? { details: err.details } : {})
    }
  };

  if (status >= 500 && process.env.NODE_ENV !== "production") {
    console.error(err);
  }

  res.status(status).json(payload);
}
