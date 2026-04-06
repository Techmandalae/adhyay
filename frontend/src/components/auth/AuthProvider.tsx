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
  signIn: (token: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "token";

function getStoredAuthState() {
  if (typeof window === "undefined") {
    return {
      token: null as string | null,
      user: null as AuthUser | null,
      isLoading: true
    };
  }

  const stored = window.localStorage.getItem(TOKEN_KEY);
  return {
    token: stored,
    user: stored ? decodeJwt(stored) : null,
    isLoading: false
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState(getStoredAuthState);

  const signIn = useCallback((newToken: string) => {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    setAuthState({
      token: newToken,
      user: decodeJwt(newToken),
      isLoading: false
    });
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
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
