import { createContext, useContext, useState } from "react";

const CartContext = createContext(null);

function readCart() {
  try {
    return JSON.parse(localStorage.getItem("tablehouse-cart") || "{}");
  } catch {
    return {};
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readCart);

  function update(next) {
    setItems(next);
    localStorage.setItem("tablehouse-cart", JSON.stringify(next));
  }

  function add(item) {
    update({
      ...items,
      [item.id]: { ...item, quantity: (items[item.id]?.quantity || 0) + 1 },
    });
  }

  function setQuantity(id, quantity) {
    const next = { ...items };
    if (quantity < 1) delete next[id];
    else next[id] = { ...next[id], quantity };
    update(next);
  }

  function clear() {
    update({});
  }
  const lines = Object.values(items);
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  const total = lines.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{ items, lines, count, total, add, setQuantity, clear }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
