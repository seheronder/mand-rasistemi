// src/screens/EntrySelect.js
import React, { useRef, useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { COLORS } from "../theme/colors";

export default function EntrySelect({ navigation }) {
  const [mode, setMode] = useState("musteri"); // "musteri" | "mandira"

  const anim = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  const KNOB_SIZE = 32;
  const TRACK_PADDING = 4;
  const BORDER_WIDTH = 2;

  // İç genişlik: border + padding sonrası
  const innerWidth =
    trackWidth > 0 ? trackWidth - 2 * BORDER_WIDTH - 2 * TRACK_PADDING : 0;

  // knob'un gidebileceği max mesafe
  const maxTranslate = Math.max(innerWidth - KNOB_SIZE, 0);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: mode === "musteri" ? 0 : 1,
      useNativeDriver: false, // ✅ en stabil
      friction: 8,
      tension: 80,
    }).start();
  }, [mode, anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxTranslate],
  });

  const handleToggle = () => {
    setMode((prev) => (prev === "musteri" ? "mandira" : "musteri"));
  };

  const handleContinue = () => {
    navigation.navigate("Login", { mode });
  };

  const label = mode === "musteri" ? "Sipariş Veren Girişi" : "Mandıra Girişi";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle}>Mandıra Adı</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.container}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>LOGO</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.switchWrapper}
          onPress={handleToggle}
        >
          <View
            style={styles.switchTrack}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                styles.knob,
                {
                  width: KNOB_SIZE,
                  height: KNOB_SIZE,
                  transform: [{ translateX }],
                },
              ]}
            />
          </View>
        </TouchableOpacity>

        <Text style={styles.modeLabel}>{label}</Text>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Devam Et</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    height: 56,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  headerSide: { width: 40 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  logoText: { color: COLORS.primary, fontSize: 18, fontWeight: "700" },

  switchWrapper: { marginTop: 10 },
  switchTrack: {
    width: 160,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  knob: {
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },

  modeLabel: { marginTop: 12, fontSize: 14, color: COLORS.text },
  button: {
    marginTop: 32,
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  buttonText: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
});
