import { createContext, useContext, useEffect, useState } from "react";
import { prepareApi, request } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    prepareApi()
      .then(() => request("/auth/me"))
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signIn(credentials) {
    await prepareApi();
    const profile = await request("/auth/login", {
      method: "POST",
      body: credentials,
    });
    setUser(profile);
    return profile;
  }

  async function register(details) {
    await prepareApi();
    const profile = await request("/auth/register", {
      method: "POST",
      body: details,
    });
    setUser(profile);
    return profile;
  }

  async function signOut() {
    await request("/auth/logout", { method: "POST", body: {} });
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser, ready, signIn, register, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
