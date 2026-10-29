import { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, User } from "./api";
const Context = createContext<{
  user: User | null;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
}>({ user: null, can: () => false, logout: async () => {} });
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cache = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["session"],
    queryFn: () =>
      api<{ data: User }>("/auth/me").catch((error) => {
        if (error instanceof ApiError && error.status === 401)
          return { data: null };
        throw error;
      }),
    retry: false,
  });
  useEffect(() => {
    const expire = () => {
      void cache.cancelQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      cache.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      cache.setQueryData(["session"], { data: null });
    };
    window.addEventListener("auth-expired", expire);
    return () => window.removeEventListener("auth-expired", expire);
  }, [cache]);
  if (isPending)
    return (
      <div className="loading-screen" role="status">
        Opening the personnel register…
      </div>
    );
  if (error)
    return (
      <div className="loading-screen">
        <p>Unable to connect to the personnel service.</p>
        <button
          onClick={() =>
            void cache.invalidateQueries({ queryKey: ["session"] })
          }
        >
          Try again
        </button>
      </div>
    );
  const user = data?.data ?? null;
  return (
    <Context.Provider
      value={{
        user,
        can: (permission) => Boolean(user?.permissions.includes(permission)),
        logout: async () => {
          await api("/auth/logout", { method: "POST" });
          void cache.cancelQueries({
            predicate: (query) => query.queryKey[0] !== "session",
          });
          cache.removeQueries({
            predicate: (query) => query.queryKey[0] !== "session",
          });
          cache.setQueryData(["session"], { data: null });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
