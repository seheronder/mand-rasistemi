// src/navigation/AppTabs.js
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Home from "../screens/Home";
import Category from "../screens/Category";
import Cart from "../screens/Cart";
import Profile from "../screens/Profile";
import Orders from "../screens/Orders";
import CustomersSummary from "../screens/CustomersSummary";
import { useAuth } from "../context/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  const { user } = useAuth();

  const role = user?.role || "customer";
  const isStaff = role === "mandira" || role === "courier";  // ✅ ikisi aynı tab
  const isCustomer = role === "customer";
  


  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName = "ellipse-outline";

          switch (route.name) {
            case "Ana Sayfa":
              iconName = "home-outline";
              break;
            case "Kategori":
              iconName = "list-outline";
              break;
            case "Sepet":
              iconName = "cart-outline";
              break;
            case "Profil":
              iconName = "person-outline";
              break;
            case "Siparişler":
              iconName = "reader-outline";
              break;
            case "Müşteriler":
              iconName = "people-outline";
              break;
            default:
              iconName = "ellipse-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      {/* Ortak */}
      <Tab.Screen name="Ana Sayfa" component={Home} />

      {isStaff && (
        <>
          <Tab.Screen name="Siparişler" component={Orders} />
          <Tab.Screen name="Müşteriler" component={CustomersSummary} />
        </>
      )}
      
      {isCustomer && (
        <>
          <Tab.Screen name="Kategori" component={Category} />
          <Tab.Screen name="Sepet" component={Cart} />
        </>
      )}
      
      <Tab.Screen name="Profil" component={Profile} />
      
    </Tab.Navigator>
  );
}
