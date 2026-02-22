// src/screens/CustomersSummary.js
import React, { useMemo, useState, useEffect } from "react";
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { COLORS } from "../theme/colors";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function CustomersSummary() {
  const { user } = useAuth();
  const mandiraCode = user?.mandiraCode || null;

  const [orders, setOrders] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentText, setPaymentText] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const formatPrice = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} ₺`;

  const toNumber = (txt) => {
    const raw = String(txt || "").replace(",", ".").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const clampMin0 = (n) => (n < 0 ? 0 : n);

  // ✅ useEffect dışına aldık ki ödeme kaydedince tekrar çağırabilelim
  const fetchData = async () => {
    if (!mandiraCode) return;

    try {
      setLoading(true);

      // 1) orders: customer_id üzerinden topla
      const { data: ords, error: ordErr } = await supabase
        .from("orders")
        .select("id, customer_id, total, mandira_code")
        .eq("mandira_code", mandiraCode);

      if (ordErr) {
        console.log("CUSTOMERS ORDERS ERROR:", ordErr);
        setOrders([]);
        setProfilesMap({});
        return;
      }

      const rows = ords || [];
      setOrders(rows);

      // 2) profilleri çek
      const customerIds = Array.from(
        new Set(rows.map((o) => o.customer_id).filter(Boolean))
      );

      if (customerIds.length === 0) {
        setProfilesMap({});
        return;
      }

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, name, phone, balance, total_paid")
        .in("id", customerIds);

      if (profErr) {
        console.log("CUSTOMERS PROFILES ERROR:", profErr);
        setProfilesMap({});
        return;
      }

      const map = {};
      (profs || []).forEach((p) => {
        map[p.id] = p;
      });
      setProfilesMap(map);
    } catch (e) {
      console.log("CUSTOMERS EXCEPTION:", e);
      setOrders([]);
      setProfilesMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [mandiraCode]);

  const customers = useMemo(() => {
    // customer_id -> toplam sipariş tutarı
    const agg = {};

    (orders || []).forEach((o) => {
      const cid = o.customer_id || "unknown";
      if (!agg[cid]) agg[cid] = { id: cid, totalOrders: 0 };
      agg[cid].totalOrders += Number(o.total || 0);
    });

    // profillerle birleştir
    return Object.values(agg)
      .filter((c) => c.id !== "unknown")
      .map((c) => {
        const p = profilesMap[c.id] || {};
        const balance = Number(p.balance || 0);      // ✅ borç
        const paid = Number(p.total_paid || 0);      // ✅ ödenen
        return {
          id: c.id,
          name: p.name || "Bilinmeyen Müşteri",
          phone: p.phone || "",
          totalAmount: Number(c.totalOrders || 0),
          paidAmount: paid,
          remainingAmount: balance, // ✅ borç = balance
        };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr-TR"));
  }, [orders, profilesMap]);

  const filteredCustomers = useMemo(() => {
    const needle = (search || "").trim().toLocaleLowerCase("tr-TR");

    return customers.filter((c) => {
      if (!showAllCustomers && Number(c.remainingAmount || 0) <= 0) return false;
      if (!needle) return true;
      return (c.name || "").toLocaleLowerCase("tr-TR").includes(needle);
    });
  }, [customers, search, showAllCustomers]);

  const openPaymentModal = (customer) => {
    setSelectedCustomer(customer);
    setPaymentText("");
    setModalVisible(true);
  };

  // ✅ DB’ye ödeme yaz: total_paid += amount, balance -= amount
  const handleSavePayment = async () => {
    if (!selectedCustomer?.id) {
      setModalVisible(false);
      return;
    }

    const amount = toNumber(paymentText);
    if (!amount || amount <= 0) {
      alert("Lütfen geçerli bir ödeme tutarı girin.");
      return;
    }

    try {
      // Güncel değerleri oku
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("balance, total_paid")
        .eq("id", selectedCustomer.id)
        .maybeSingle();

      if (pErr) {
        console.log("PAYMENT PROFILE SELECT ERROR:", pErr);
        alert("Profil okunamadı.");
        return;
      }

      const curBalance = Number(p?.balance || 0);
      const curPaid = Number(p?.total_paid || 0);

      // Borçtan fazla ödeme engeli (istersen kaldırırız)
      if (amount > curBalance) {
        alert(`Bu müşteri için maksimum tahsilat: ${formatPrice(curBalance)}`);
        return;
      }

      const nextBalance = clampMin0(curBalance - amount);
      const nextPaid = curPaid + amount;

      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          balance: nextBalance,
          total_paid: nextPaid,
        })
        .eq("id", selectedCustomer.id);

      if (upErr) {
        console.log("PAYMENT PROFILE UPDATE ERROR:", upErr);
        alert("Ödeme kaydedilemedi.");
        return;
      }

      // UI
      setModalVisible(false);
      setPaymentText("");
      setSelectedCustomer(null);

      await fetchData(); // ✅ liste hemen güncellensin
      alert("Ödeme kaydedildi ✅");
    } catch (e) {
      console.log("PAYMENT EXCEPTION:", e);
      alert("Beklenmeyen bir hata oluştu.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle}>Müşteriler</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Müşteri ara..."
          value={search}
          onChangeText={setSearch}
        />

        <TouchableOpacity
          style={[styles.toggleBtn, showAllCustomers && styles.toggleBtnActive]}
          onPress={() => setShowAllCustomers((p) => !p)}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleText, showAllCustomers && styles.toggleTextActive]}>
            {showAllCustomers ? "Tümü" : "Sadece Borç"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={[styles.emptySub, { marginTop: 8 }]}>Müşteriler yükleniyor...</Text>
          </View>
        ) : filteredCustomers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Henüz müşteri yok.</Text>
            <Text style={styles.emptySub}>Sipariş geldikçe müşteriler burada listelenecek.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {filteredCustomers.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.card}
                onPress={() => openPaymentModal(c)}
                activeOpacity={0.8}
              >
                <Text style={styles.customerName}>{c.name}</Text>
                {!!c.phone && <Text style={styles.phoneText}>{c.phone}</Text>}

                <View style={styles.row}>
                  <Text style={styles.label}>Toplam Sipariş Tutarı</Text>
                  <Text style={styles.value}>{formatPrice(c.totalAmount)}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Borç (balance)</Text>
                  <Text style={[styles.value, styles.remaining]}>{formatPrice(c.remainingAmount)}</Text>
                </View>

                <Text style={styles.tapHint}>Detay / ödeme için karta dokun</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Ödeme Gir</Text>
            {selectedCustomer && <Text style={styles.modalSubtitle}>Müşteri: {selectedCustomer.name}</Text>}

            <TextInput
              style={styles.modalInput}
              placeholder="Ödeme tutarı (₺)"
              keyboardType="decimal-pad"
              value={paymentText}
              onChangeText={setPaymentText}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonCancelText}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSavePayment}
              >
                <Text style={styles.modalButtonSaveText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerSide: { width: 40, alignItems: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: COLORS.white, fontSize: 18, fontWeight: "600" },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  toggleBtnActive: { borderColor: COLORS.primary, backgroundColor: "#E5F4F8" },
  toggleText: { fontSize: 12, color: COLORS.muted, fontWeight: "600" },
  toggleTextActive: { color: COLORS.primary },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 40 },
  emptyText: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  emptySub: { fontSize: 13, color: COLORS.muted },

  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  customerName: { fontSize: 15, fontWeight: "700", marginBottom: 4, color: COLORS.text },
  phoneText: { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 13, color: COLORS.muted },
  value: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  remaining: { color: "#D9534F" },
  tapHint: { marginTop: 8, fontSize: 11, color: COLORS.muted, textAlign: "right" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  modalBox: { width: "80%", backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6, color: COLORS.text },
  modalSubtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 10 },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 14 },
  modalButtonsRow: { flexDirection: "row", justifyContent: "flex-end" },
  modalButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, marginLeft: 8 },
  modalButtonCancel: { backgroundColor: "#eee" },
  modalButtonSave: { backgroundColor: COLORS.primary },
  modalButtonCancelText: { fontSize: 13, color: COLORS.text },
  modalButtonSaveText: { fontSize: 13, color: "#fff", fontWeight: "700" },
});
