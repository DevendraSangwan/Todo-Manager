import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api("/auth/me")
      .then(({ user: currentUser }) => {
        if (currentUser.timezone) localStorage.setItem("daymark-timezone", currentUser.timezone);
        setUser(currentUser);
      })
      .catch((error) => {
        if (error.status !== 401) console.error(error);
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const value = useMemo(() => ({ user, setUser, checking }), [user, checking]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
