// src/screens/Home.js
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../theme/colors";
import { supabase } from "../lib/supabaseClient";

const FILTERS = ["Tümü", "Bekliyor", "Teslim Edildi"];
const PER_PAGE_OPTIONS = [5, 10, 20];

export default function Home() {
  const { user } = useAuth();

  const role = user?.role || "customer";
  const isMandira = role === "mandira";
  const isCourier = role === "courier";
  const isCustomer = role === "customer";

  // ✅ ÜST KARTLAR
  const [debtOrToCollect, setDebtOrToCollect] = useState(0);
  const [paidOrCollected, setPaidOrCollected] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ✅ Orders
  const [orders, setOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState("Tümü");
  const [perPageIndex, setPerPageIndex] = useState(1);
  const [page, setPage] = useState(0);

  const [refreshing, setRefreshing] = useState(false);

  const formatPrice = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} ₺`;

  const formatDate = (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR");
  };

  // ✅ SUMMARY
  // customer => profiles.balance / profiles.total_paid
  // mandira  => orders toplamı (Bekliyor / Teslim Edildi) mandira_code'a göre
  // courier  => orders toplamı (Bekliyor / Teslim Edildi) courier_id'ye göre
  const fetchSummary = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoadingSummary(true);

      // CUSTOMER
      if (isCustomer) {
        const { data, error } = await supabase
          .from("profiles")
          .select("balance, total_paid")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.log("HOME SUMMARY (CUSTOMER) ERROR:", error);
          return;
        }

        setDebtOrToCollect(Number(data?.balance || 0));
        setPaidOrCollected(Number(data?.total_paid || 0));
        return;
      }

      // MANDIRA / COURIER => orderlardan hesapla
      let q = supabase.from("orders").select("total, status");

      if (isMandira) {
        q = q.eq("mandira_code", user?.mandiraCode || "");
      } else if (isCourier) {
        q = q.eq("courier_id", user.id);
      } else {
        q = q.eq("mandira_code", user?.mandiraCode || "");
      }

      const { data: rows, error } = await q;

      if (error) {
        console.log("HOME SUMMARY (STAFF) ERROR:", error);
        return;
      }

      let toCollect = 0; // Bekliyor
      let collected = 0; // Teslim Edildi

      (rows || []).forEach((r) => {
        const t = Number(r.total || 0);
        if ((r.status || "") === "Teslim Edildi") collected += t;
        else toCollect += t;
      });

      setDebtOrToCollect(toCollect);
      setPaidOrCollected(collected);
    } catch (e) {
      console.log("HOME SUMMARY EXCEPTION:", e);
    } finally {
      setLoadingSummary(false);
    }
  }, [user?.id, user?.mandiraCode, isCustomer, isMandira, isCourier]);

  // ✅ ORDERS (müşteri adı dahil)
  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;

    try {
      let query = supabase
        .from("orders")
        .select("id, total, status, created_at, customer_id, user_id, mandira_code, courier_id")
        .order("created_at", { ascending: false });

      if (isMandira) {
        query = query.eq("mandira_code", user?.mandiraCode || "");
      } else if (isCourier) {
        query = query.eq("courier_id", user.id);
      } else {
        query = query.or(`customer_id.eq.${user.id},user_id.eq.${user.id}`);
      }

      const { data, error } = await query;

      if (error) {
        console.log("HOME ORDERS ERROR:", error);
        return;
      }

      const rows = data || [];

      // ✅ Mandıra/Kurye: customer_id -> profiles.name
      let profilesMap = {};
      if (isMandira || isCourier) {
        const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));

        if (customerIds.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id, name")
            .in("id", customerIds);

          if (profErr) {
            console.log("HOME PROFILES ERROR:", profErr);
          } else {
            (profs || []).forEach((p) => {
              profilesMap[p.id] = p;
            });
          }
        }
      }

      const mapped = rows.map((o) => {
        const customerName =
          (isMandira || isCourier) && o.customer_id
            ? (profilesMap[o.customer_id]?.name || "Müşteri")
            : null;

        return {
          id: o.id,
          number: `#${o.id}`,
          total: Number(o.total || 0),
          status: o.status || "Bekliyor",
          createdAt: o.created_at,
          customerName, // ✅
        };
      });

      setOrders(mapped);
    } catch (e) {
      console.log("HOME ORDERS EXCEPTION:", e);
    }
  }, [user?.id, user?.mandiraCode, isMandira, isCourier]);

  useEffect(() => {
    fetchSummary();
    fetchOrders();
  }, [fetchSummary, fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    await fetchOrders();
    setRefreshing(false);
  }, [fetchSummary, fetchOrders]);

  const filteredOrders = useMemo(() => {
    if (activeFilter === "Tümü") return orders;
    return orders.filter((o) => o.status === activeFilter);
  }, [orders, activeFilter]);

  const perPage = PER_PAGE_OPTIONS[perPageIndex];
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / perPage));

  const paginatedOrders = useMemo(() => {
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * perPage;
    return filteredOrders.slice(start, start + perPage);
  }, [filteredOrders, page, perPage, totalPages]);

  const handleChangePerPage = () => {
    setPerPageIndex((prev) => {
      const next = (prev + 1) % PER_PAGE_OPTIONS.length;
      setPage(0);
      return next;
    });
  };

  const handlePrevPage = () => setPage((prev) => Math.max(0, prev - 1));
  const handleNextPage = () => setPage((prev) => Math.min(totalPages - 1, prev + 1));

  const cardDebtTitle = isMandira || isCourier ? "Tahsil Edilecek" : "Borç";
  const cardPaidTitle = isMandira || isCourier ? "Tahsil Edilen" : "Ödenen";

  const identityLabel = isMandira ? "Mandıra" : isCourier ? "Kurye" : "Müşteri";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ana Sayfa</Text>
      </View>

      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ✅ ÜST KARTLAR */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
              <Text style={styles.summaryLabel}>{cardDebtTitle}</Text>
              <Text style={styles.summaryValue}>
                {loadingSummary ? "..." : formatPrice(debtOrToCollect)}
              </Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
              <Text style={styles.summaryLabel}>{cardPaidTitle}</Text>
              <Text style={styles.summaryValue}>
                {loadingSummary ? "..." : formatPrice(paidOrCollected)}
              </Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardOutline]}>
              <Text style={[styles.summaryLabel, { color: COLORS.text }]}>{identityLabel}</Text>
              <View style={styles.deliveryRow}>
                <Ionicons name="person-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.deliveryName} numberOfLines={1}>
                  {user?.name || "—"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Siparişler</Text>

          {/* ✅ FILTERS */}
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = f === activeFilter;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => {
                    setActiveFilter(f);
                    setPage(0);
                  }}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.5 }]}>Sipariş</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Tarih</Text>
              <Text style={[styles.th, { flex: 1 }]}>Tutar</Text>
            </View>

            {paginatedOrders.map((o, idx) => (
              <View
                key={o.id}
                style={[styles.row, idx === paginatedOrders.length - 1 && { borderBottomWidth: 0 }]}
              >
                <Text style={[styles.td, { flex: 1.5 }]}>
                  {(isMandira || isCourier) ? `${o.number} • ${o.customerName || "Müşteri"}` : o.number}
                </Text>
                <Text style={[styles.td, { flex: 1.5 }]}>{formatDate(o.createdAt)}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{formatPrice(o.total)}</Text>
              </View>
            ))}

            <View style={styles.tableFooter}>
              <TouchableOpacity style={styles.perPageBox} onPress={handleChangePerPage}>
                <Text style={styles.perPageNumber}>{perPage}</Text>
                <Text style={styles.perPageText}>/ Sayfa</Text>
              </TouchableOpacity>

              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                  onPress={handlePrevPage}
                  disabled={page === 0}
                >
                  <Text style={styles.pageBtnText}>{"<"}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pageBtn, page === totalPages - 1 && styles.pageBtnDisabled]}
                  onPress={handleNextPage}
                  disabled={page === totalPages - 1}
                >
                  <Text style={styles.pageBtnText}>{">"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {orders.length === 0 && (
            <Text style={{ marginTop: 10, color: COLORS.muted, textAlign: "center" }}>
              Henüz sipariş yok.
            </Text>
          )}
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

  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  summaryCard: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, marginHorizontal: 3 },
  summaryCardPrimary: { backgroundColor: COLORS.primary },
  summaryCardOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border },
  summaryLabel: { fontSize: 12, color: "#fff" },
  summaryValue: { marginTop: 4, fontSize: 16, fontWeight: "700", color: "#fff" },
  deliveryRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  deliveryName: { marginLeft: 4, fontSize: 12, color: COLORS.text },

  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.text, marginBottom: 10 },

  filterRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  filterBtn: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  filterBtnActive: { borderColor: COLORS.primary },
  filterText: { fontSize: 12, color: COLORS.text },
  filterTextActive: { color: COLORS.primary, fontWeight: "700" },

  tableCard: { borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff", overflow: "hidden" },
  tableHeader: { flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  th: { fontSize: 11, fontWeight: "600", color: COLORS.muted },
  row: { flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: "#F1F1F8" },
  td: { fontSize: 12, color: COLORS.text },

  tableFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8 },
  perPageBox: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4 },
  perPageNumber: { fontSize: 12, fontWeight: "700", marginRight: 4 },
  perPageText: { fontSize: 11, color: COLORS.muted },
  pagination: { flexDirection: "row" },
  pageBtn: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6, backgroundColor: "#fff" },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 12, color: COLORS.text, fontWeight: "700" },
});
