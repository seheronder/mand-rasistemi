import React, { useState } from "react";
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { COLORS } from "../theme/colors";

export default function ForgotPassword({ navigation }) {
  const [phone, setPhone] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <Text style={styles.title}>Şifrenizi mi unuttunuz?</Text>
        <Text style={styles.subtitle}>
          Telefon numaranızı girin, sıfırlama talimatlarını size gönderelim.
        </Text>

        <Text style={styles.label}>Telefon Numarası</Text>
        <TextInput
          style={styles.input}
          placeholder="Telefon Numaranız"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <TouchableOpacity style={styles.button}>
          <Text style={styles.btnText}>Sıfırlama Talimatlarını Gönder</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    color: COLORS.muted,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 15,
  },
  link: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 13,
  },
});
