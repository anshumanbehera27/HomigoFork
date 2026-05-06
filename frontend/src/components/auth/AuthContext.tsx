import { createContext, useContext } from "react";

type AuthContextValue = {
  userId: string | number;
  isClerkEnabled: boolean;
  authReady: boolean;
  userProfile?: {
    fullName?: string | null;
    email?: string;
    phone?: string;
    imageUrl?: string;
  };
};

const AuthContext = createContext<AuthContextValue>({
  userId: Number(import.meta.env.VITE_DEMO_USER_ID ?? 1),
  isClerkEnabled: false,
  authReady: true,
});

export const AuthProvider = AuthContext.Provider;

export function useHomigoAuth() {
  return useContext(AuthContext);
}
