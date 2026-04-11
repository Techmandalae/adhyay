import type { Request, RequestHandler } from "express";

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer?: Buffer;
    }
  }
}

declare module "multer" {
  interface FileFilterCallback {
    (error: Error | null, acceptFile?: boolean): void;
  }

  interface DiskStorageOptions {
    destination: (
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, destination: string) => void
    ) => void;
    filename: (
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void
    ) => void;
  }

  interface StorageEngine {
    _handleFile: (
      req: Request,
      file: Express.Multer.File,
      cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void
    ) => void;
    _removeFile: (
      req: Request,
      file: Express.Multer.File,
      cb: (error?: Error | null) => void
    ) => void;
  }

  interface MulterOptions {
    storage?: StorageEngine;
    limits?: {
      fileSize?: number;
      files?: number;
    };
    fileFilter?: (
      req: Request,
      file: Express.Multer.File,
      cb: FileFilterCallback
    ) => void;
  }

  interface Multer {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
  }

  function multer(options?: MulterOptions): Multer;
  namespace multer {
    function diskStorage(options: DiskStorageOptions): StorageEngine;
    function memoryStorage(): StorageEngine;
  }

  export = multer;
}
