"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { decodeJwt } from "@/lib/jwt";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const decoded = decodeJwt(stored);
      setToken(stored);
      setUser(decoded);
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback((newToken: string) => {
    const decoded = decodeJwt(newToken);
    setToken(newToken);
    setUser(decoded);
    window.localStorage.setItem(TOKEN_KEY, newToken);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(TOKEN_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      signIn,
      signOut
    }),
    [token, user, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
