import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AuthContext } from "./auth-context-value";

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
