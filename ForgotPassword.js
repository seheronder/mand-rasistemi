import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import EntrySelect from "../screens/EntrySelect";
import Login from "../screens/Login";
import Register from "../screens/Register";
import ForgotPassword from "../screens/ForgotPassword";
import NewPassword from "../screens/NewPassword";

const Stack = createNativeStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* İLK AÇILACAK EKRAN */}
      <Stack.Screen name="EntrySelect" component={EntrySelect} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Register" component={Register} />
      <Stack.Screen name="Forgot" component={ForgotPassword} />
      <Stack.Screen name="NewPassword" component={NewPassword} />
    </Stack.Navigator>
  );
}
