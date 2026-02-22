// src/screens/Cart.js
import React, { useState } from "react";
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { COLORS } from "../theme/colors";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function Cart({ navigation }) {
  const { cart, increaseQty, decreaseQty, removeItem, total, clearCart } = useCart();
  const { user } = useAuth();

  const [placing, setPlacing] = useState(false);

  const formatPrice = (value) =>
    `${Number(value || 0).toFixed(2).replace(".", ",")} ₺`;

  const handlePlaceOrder = async () => {
    if (!user?.id) {
      Alert.alert("Giriş gerekli", "Sipariş vermek için önce giriş yapın.");
      return;
    }

    if (!cart || cart.length === 0) {
      Alert.alert("Sepet boş", "Sipariş oluşturmak için ürün ekleyin.");
      return;
    }

    const totalAmount = Number(total || 0);
    if (!totalAmount || totalAmount <= 0) {
      Alert.alert("Hata", "Tutar hesaplanamadı.");
      return;
    }

    if (placing) return;

    try {
      setPlacing(true);

      // 0) müşterinin delivery_zone_id + courier_id çöz
      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("delivery_zone_id, mandira_code")
        .eq("id", user.id)
        .maybeSingle();

      if (meErr) {
        console.log("ME PROFILE ERROR:", meErr);
        Alert.alert("Hata", meErr.message || "Profil bilgisi alınamadı.");
        return;
      }

      const deliveryZoneId = me?.delivery_zone_id || null;
      const mandiraCode = (me?.mandira_code || user?.mandiraCode || null);

      if (!deliveryZoneId) {
        Alert.alert("Eksik bilgi", "Bölge seçilmemiş. Profilinden bölge seçmelisin.");
        return;
      }

      const { data: zone, error: zErr } = await supabase
        .from("delivery_zones")
        .select("courier_id")
        .eq("id", deliveryZoneId)
        .maybeSingle();

      if (zErr) {
        console.log("ZONE SELECT ERROR:", zErr);
        Alert.alert("Hata", zErr.message || "Bölge bilgisi alınamadı.");
        return;
      }

      const courierId = zone?.courier_id || null;
      // courier_id null olabilir (atanmamışsa) => sipariş yine düşer ama kurye filtreye girmez
      // istersen burada hard-stop yaptırırız:
      // if (!courierId) { Alert.alert("Eksik bilgi", "Bu bölgeye kurye atanmamış."); return; }

      // 1) Sepetteki ürün id'lerini al
      const productIds = cart.map((c) => c.id);

      // 2) DB'den stokları çek
      const { data: dbProducts, error: stockErr } = await supabase
        .from("products")
        .select("id, stock_quantity, name")
        .in("id", productIds);

      if (stockErr) {
        console.log("STOCK SELECT ERROR:", stockErr);
        Alert.alert("Hata", stockErr.message || "Stok kontrolü yapılamadı.");
        return;
      }

      // 3) Sepetteki ürünleri stokla karşılaştır
      const stockMap = new Map(
        (dbProducts || []).map((p) => [
          String(p.id),
          { stock: Number(p.stock_quantity || 0), name: p.name || "" },
        ])
      );

      const problems = [];
      for (const item of cart) {
        const key = String(item.id);
        const info = stockMap.get(key);

        const wantedQty = Number(item.qty || 0);
        const available = Number(info?.stock ?? 0);

        if (!info) {
          problems.push(`${item.name || "Ürün"} bulunamadı (DB).`);
          continue;
        }

        if (available <= 0) {
          problems.push(`${info.name || item.name || "Ürün"} stokta yok.`);
          continue;
        }

        if (wantedQty > available) {
          problems.push(
            `${info.name || item.name || "Ürün"} için stok yetersiz. (Stok: ${available}, Sepet: ${wantedQty})`
          );
        }
      }

      if (problems.length > 0) {
        Alert.alert("Stok yetersiz", problems.join("\n"));
        return;
      }

      // 4) Orders payload
      const itemsPayload = cart.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
      }));

      // 5) Siparişi kaydet (✅ delivery_zone_id + courier_id eklendi)
      const { data: inserted, error: orderErr } = await supabase
        .from("orders")
        .insert([
          {
            customer_id: user.id,
            user_id: user.id,
            mandira_code: mandiraCode,
            delivery_zone_id: deliveryZoneId,   // ✅ kritik
            courier_id: courierId,              // ✅ kritik
            total: totalAmount,
            status: "Bekliyor",
            items: itemsPayload,
            address: user.address || null,
            payment_type: "Nakit",
          },
        ])
        .select("id")
        .single();

      if (orderErr) {
        console.log("ORDER INSERT ERROR:", orderErr);
        Alert.alert("Sipariş kaydedilemedi", orderErr.message || "orders insert hatası");
        return;
      }

      // 6) Stok düş (DB update ile) ✅
      for (const item of cart) {
        const wantedQty = Number(item.qty || 0);
      
        // mevcut stoğu dbProducts'tan bul (yukarıda zaten çekmiştik)
        const dbRow = (dbProducts || []).find((p) => String(p.id) === String(item.id));
        const currentStock = Number(dbRow?.stock_quantity || 0);
        const nextStock = Math.max(0, currentStock - wantedQty);
      
        const { error: upErr } = await supabase
          .from("products")
          .update({ stock_quantity: nextStock })
          .eq("id", item.id);
      
        if (upErr) {
          console.log("STOCK UPDATE ERROR:", upErr);
          Alert.alert("Uyarı", "Sipariş alındı ama stok güncellenemedi.");
        }
      }
      


      // 7) Balance arttır
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        console.log("BALANCE SELECT ERROR:", profErr);
      } else {
        const current = Number(prof?.balance || 0);
        const next = current + totalAmount;

        const { error: upBalErr } = await supabase
          .from("profiles")
          .update({ balance: next })
          .eq("id", user.id);

        if (upBalErr) console.log("BALANCE UPDATE ERROR:", upBalErr);
      }

      // 8) UI
      clearCart();
      Alert.alert("Başarılı", `Sipariş oluşturuldu! (#${inserted?.id})`);
      navigation.navigate("Ana Sayfa");
    } catch (e) {
      console.log("ORDER EXCEPTION:", e);
      Alert.alert("Hata", "Beklenmeyen bir hata oluştu.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sepet</Text>
      </View>

      <View style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {cart.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{formatPrice(item.price)}</Text>
              </View>

              <View style={styles.qtyRow}>
                <TouchableOpacity onPress={() => decreaseQty(item.id)} style={styles.qtyBtn} disabled={placing}>
                  <Text style={styles.qtyBtnText}>-</Text>
                </TouchableOpacity>

                <Text style={styles.qtyText}>{item.qty}</Text>

                <TouchableOpacity onPress={() => increaseQty(item.id)} style={styles.qtyBtn} disabled={placing}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn} disabled={placing}>
                <Text style={styles.removeText}>Sil</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{formatPrice(total)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.orderBtn, placing && { opacity: 0.7 }]}
            onPress={handlePlaceOrder}
            disabled={placing}
          >
            {placing ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.orderBtnText, { marginLeft: 8 }]}>Sipariş veriliyor...</Text>
              </View>
            ) : (
              <Text style={styles.orderBtnText}>Sipariş Ver</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    height: 56,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  container: { flex: 1, padding: 16 },

  itemCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  itemPrice: { marginTop: 4, fontSize: 12, color: COLORS.muted },

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

  removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  removeText: { color: "#D9534F", fontWeight: "700", fontSize: 12 },

  totalBox: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: 13, color: COLORS.muted, fontWeight: "600" },
  totalValue: { fontSize: 15, color: COLORS.text, fontWeight: "800" },

  orderBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  orderBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
