import React, { createContext, useContext, useMemo, useState } from "react";
import {
  clearStoredAuth,
  getStoredEmail,
  getStoredToken,
  setStoredEmail,
  setStoredToken
} from "./auth";

export type AuthState = {
  token: string | null;
  email: string | null;
};

type AuthContextValue = AuthState & {
  login: (token: string) => void;
  logout: () => void;
  setEmail: (email: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [email, setEmailState] = useState<string | null>(getStoredEmail());

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      email,
      login: (newToken) => {
        setToken(newToken);
        setStoredToken(newToken);
      },
      logout: () => {
        setToken(null);
        setEmailState(null);
        clearStoredAuth();
      },
      setEmail: (newEmail) => {
        setEmailState(newEmail);
        setStoredEmail(newEmail);
      }
    }),
    [token, email]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
