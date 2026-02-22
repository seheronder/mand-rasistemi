// src/screens/Category.js
import React, { useEffect, useState, useMemo } from "react";
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
} from "react-native";
import { COLORS } from "../theme/colors";
import { supabase } from "../lib/supabaseClient";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

const CATEGORY_LIST = [
  { label: "Tümü", value: "all" },
  { label: "Süt", value: "sut" },
  { label: "Peynir", value: "peynir" },
  { label: "Yoğurt", value: "yogurt" },
  { label: "Şarküteri", value: "sarkuteri" },
];

const normalizeTr = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/Ç/g, "c")
    .replace(/Ğ/g, "g")
    .replace(/İ/g, "i")
    .replace(/Ö/g, "o")
    .replace(/Ş/g, "s")
    .replace(/Ü/g, "u");

export default function Category() {
  const { addToCart } = useCart();
  const { user } = useAuth();

  const mandiraCode = (user?.mandiraCode || "").trim().toUpperCase();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // ✅ ürün başına adet seçimi
  const [qtyMap, setQtyMap] = useState({}); // { [productId]: qty }

  const getQty = (id) => Number(qtyMap[id] || 1);
  const incQty = (id) => setQtyMap((p) => ({ ...p, [id]: getQty(id) + 1 }));
  const decQty = (id) => setQtyMap((p) => ({ ...p, [id]: Math.max(1, getQty(id) - 1) }));

  const loadProducts = async () => {
    if (!mandiraCode) {
      setProducts([]);
      setErrorText("Mandıra kodu bulunamadı. Lütfen tekrar giriş yapın.");
      return;
    }

    try {
      setLoading(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, unit, is_active, image_url, mandira_code")
        .eq("mandira_code", mandiraCode)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorText(error.message || "Supabase products hatası");
        setProducts([]);
        return;
      }

      setProducts(data || []);
    } catch (e) {
      setErrorText(String(e));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [mandiraCode]);

  const filteredProducts = useMemo(() => {
    const searchNorm = normalizeTr(search.trim());

    return (products || []).filter((p) => {
      const nameNorm = normalizeTr(p.name || "");

      if (selectedCategory !== "all") {
        if (!nameNorm.includes(selectedCategory)) return false;
      }

      if (searchNorm) {
        if (!nameNorm.includes(searchNorm)) return false;
      }

      return true;
    });
  }, [products, search, selectedCategory]);

  const handleAddToCart = (item) => {
    const price = Number(item.price || 0);
    const qty = getQty(item.id);

    addToCart({
      id: item.id,
      name: item.name,
      price,
      unit: item.unit || "Adet",
      qty, // ✅ seçilen adetle ekle
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle}>Kategori</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 🔍 Arama */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Ürün ara..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Kategoriler */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {CATEGORY_LIST.map((c) => (
            <TouchableOpacity
              key={c.value}
              onPress={() => setSelectedCategory(c.value)}
              style={[
                styles.categoryChip,
                selectedCategory === c.value && styles.categoryChipActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === c.value && styles.categoryChipTextActive,
                ]}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ÜRÜNLER */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.centerText}>Ürünler yükleniyor...</Text>
          </View>
        ) : errorText ? (
          <View style={styles.centerBox}>
            <Text style={styles.centerText}>Hata: {errorText}</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.centerText}>Ürün bulunamadı.</Text>
          </View>
        ) : (
          filteredProducts.map((item) => {
            const price = Number(item.price || 0);
            const qty = getQty(item.id);

            return (
              <View key={item.id} style={styles.card}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={styles.imagePlaceholderText}>FOTO</Text>
                  </View>
                )}

                <View style={styles.cardRight}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.unitPrice}>
                    {price.toFixed(2).replace(".", ",")} ₺ / {item.unit || "Adet"}
                  </Text>

                  {/* ✅ ADET + / - ve Sepete Ekle */}
                  <View style={styles.actionsRow}>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => decQty(item.id)}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.qtyText}>{qty}</Text>

                      <TouchableOpacity style={styles.qtyBtn} onPress={() => incQty(item.id)}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAddToCart(item)}>
                      <Text style={styles.addBtnText}>Sepete Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
    fontSize: 18,
    fontWeight: "600",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 },

  searchRow: { marginBottom: 10 },
  searchInput: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  categoryScroll: { marginBottom: 12 },
  categoryChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    marginHorizontal: 4,
  },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 12, color: COLORS.text, fontWeight: "500" },
  categoryChipTextActive: { color: "#fff" },

  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  centerText: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
  },

  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  image: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#eee" },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { fontSize: 10, color: COLORS.muted },
  cardRight: { flex: 1, marginLeft: 10, justifyContent: "space-between" },
  name: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  unitPrice: { marginTop: 4, fontSize: 13, color: COLORS.muted },

  actionsRow: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  qtyRow: { flexDirection: "row", alignItems: "center" },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  qtyBtnText: { fontSize: 18, color: COLORS.text, fontWeight: "700" },
  qtyText: { width: 32, textAlign: "center", fontSize: 14, fontWeight: "700" },

  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { fontSize: 12, color: "#fff", fontWeight: "800" },
});
