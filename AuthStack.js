// src/context/CartContext.js
import React, { createContext, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  // siparişler (lokal cache)
  const [orders, setOrders] = useState([]);

  const addToCart = (product) => {
    const addQty = Math.max(1, Number(product?.qty || 1));
  
    setCart((prev) => {
      const existing = prev.find((p) => p.id === product.id);
  
      if (existing) {
        return prev.map((p) =>
          p.id === product.id ? { ...p, qty: (Number(p.qty || 0) + addQty) } : p
        );
      }
  
      return [...prev, { ...product, qty: addQty }];
    });
  };
  

  const increaseQty = (id) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)));
  const decreaseQty = (id) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)));
  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));
  const clearCart = () => setCart([]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0), [cart]);

  // ✅ addOrder artık var
  const addOrder = (order) => {
    setOrders((prev) => [order, ...prev]);
  };

  const value = useMemo(
    () => ({
      cart,
      addToCart,
      increaseQty,
      decreaseQty,
      removeItem,
      clearCart,
      total,
      orders,
      addOrder,
    }),
    [cart, total, orders]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
