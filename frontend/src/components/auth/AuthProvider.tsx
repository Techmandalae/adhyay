"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

import { decodeJwt } from "@/lib/jwt";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (token: string, user?: AuthUser | null) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "token";
const USER_KEY = "auth-user";

function getStoredAuthState() {
  if (typeof window === "undefined") {
    return {
      token: null as string | null,
      user: null as AuthUser | null,
      isLoading: true
    };
  }

  const stored = window.localStorage.getItem(TOKEN_KEY);
  const storedUser = window.localStorage.getItem(USER_KEY);
  let user: AuthUser | null = null;

  if (storedUser) {
    try {
      user = JSON.parse(storedUser) as AuthUser;
    } catch {
      user = null;
    }
  }

  return {
    token: stored,
    user: user ?? (stored ? decodeJwt(stored) : null),
    isLoading: false
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState(getStoredAuthState);

  const signIn = useCallback((newToken: string, newUser?: AuthUser | null) => {
    const resolvedUser = newUser ?? decodeJwt(newToken);
    window.localStorage.setItem(TOKEN_KEY, newToken);
    if (resolvedUser) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(resolvedUser));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
    setAuthState({
      token: newToken,
      user: resolvedUser,
      isLoading: false
    });
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setAuthState({
      token: null,
      user: null,
      isLoading: false
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: authState.token,
      user: authState.user,
      isLoading: authState.isLoading,
      signIn,
      signOut
    }),
    [authState, signIn, signOut]
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
