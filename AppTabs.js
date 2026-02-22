// src/context/AuthContext.js
import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = (profile) => {
    if (!profile?.id) {
      console.warn("LOGIN CALLED WITHOUT PROFILE");
      return;
    }

    setUser({
      isLoggedIn: true, // ✅ ROOT NAV bunu arıyordu
      id: profile.id,
      role: profile.role, // "customer" | "mandira"
      name: profile.name || "—",
      phone: profile.phone || "",
      mandiraCode: profile.mandiraCode || null,
      address: profile.address || "",
    });
  };

  const logout = () => setUser(null);

  const value = useMemo(
    () => ({
      user,
      isLoggedIn: !!user?.isLoggedIn,
      login,
      logout,
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
