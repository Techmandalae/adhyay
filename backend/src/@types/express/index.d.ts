import type { AuthUser } from "../../types/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
