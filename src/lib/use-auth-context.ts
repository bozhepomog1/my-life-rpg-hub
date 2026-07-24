import { useContext } from "react";
import { AuthContext } from "./auth-context-value";

export function useAuthContext() {
  return useContext(AuthContext);
}
