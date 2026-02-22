// src/AppRoot.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import AuthStack from "./navigation/AuthStack";
import AppTabs from "./navigation/AppTabs";

function RootNavigator() {
  const { user } = useAuth();
  const isLoggedIn = !!user?.isLoggedIn; // ✅

  return isLoggedIn ? <AppTabs /> : <AuthStack />;
}

export default function AppRoot() {
  return (
    <AuthProvider>
      <CartProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </CartProvider>
    </AuthProvider>
  );
}
