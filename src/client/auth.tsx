// src/client/auth.tsx
// User context — exposes current user info to all child pages via useUser().
import { createContext, useContext } from "react";

export interface User {
  email: string;
  name: string;
  isAdmin: boolean;
}

export const UserContext = createContext<User | null>(null);

/**
 * Returns the current user. Throws if called outside a UserContext provider
 * (which means AuthGate hasn't loaded yet — should not happen in practice).
 */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside UserContext.Provider");
  return user;
}
