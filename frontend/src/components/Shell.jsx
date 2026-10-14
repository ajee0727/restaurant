import { useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const layouts = {
  customer: [
    { key: "overview", label: "My table", icon: LayoutDashboard },
    { key: "menu", label: "Menu & order", icon: ShoppingBag },
    { key: "reservations", label: "Reservations", icon: CalendarDays },
    { key: "orders", label: "My orders", icon: ClipboardList },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "profile", label: "Profile", icon: Users },
  ],
  reception: [
    { key: "overview", label: "Floor overview", icon: LayoutDashboard },
    { key: "reservations", label: "Reservations", icon: CalendarDays },
    { key: "tables", label: "Table availability", icon: Settings2 },
    { key: "orders", label: "Orders & bills", icon: ClipboardList },
    { key: "walkin", label: "Walk-in order", icon: ShoppingBag },
  ],
  kitchen: [
    { key: "overview", label: "Kitchen queue", icon: ChefHat },
    { key: "history", label: "Completed", icon: ClipboardList },
  ],
  admin: [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "users", label: "People & roles", icon: Users },
    { key: "menu", label: "Menu & categories", icon: BookOpen },
    { key: "operations", label: "Restaurant floor", icon: Settings2 },
    { key: "reports", label: "Reports", icon: ClipboardList },
  ],
};

const roleNames = {
  customer: "Guest",
  reception: "Reception",
  kitchen: "Kitchen",
  admin: "Administrator",
};

export default function Shell({ active, onNavigate, children }) {
  const { user, signOut } = useAuth();
  const { count } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = layouts[user.role] || layouts.customer;

  async function exit() {
    try {
      await signOut();
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-stamp">
            T<span>.</span>
          </div>
          <div>
            <strong>Tablehouse</strong>
            <small>Restaurant desk</small>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${active === key ? "nav-active" : ""}`}
              onClick={() => {
                onNavigate(key);
                setMobileOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "menu" && user.role === "customer" && count > 0 && (
                <span className="nav-count">{count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="service-note">
            <span className="service-dot" />
            <span>
              Dining room open<small>Local operations</small>
            </span>
          </div>
          <button className="nav-item signout-button" onClick={exit}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            TABLEHOUSE <span>/</span> {roleNames[user.role]?.toUpperCase()}
          </div>
          <div className="topbar-right">
            <div className="date-label">
              {new Intl.DateTimeFormat("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </div>
            <div className="user-chip">
              <span className="user-avatar">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{roleNames[user.role]}</small>
              </span>
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
