import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChefHat,
  CircleDollarSign,
  Clock3,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { request } from "../api";
import Shell from "../components/Shell";
import {
  Alert,
  EmptyState,
  Loading,
  Modal,
  SectionTitle,
  Status,
  Table,
} from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
const stamp = (value) =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(String(value).replace(" ", "T")))
    : "—";
const dateTimeLocal = (minutes = 60) => {
  const date = new Date(Date.now() + minutes * 60000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const statusNext = { placed: "preparing", preparing: "ready", ready: "served" };
const statusLabel = {
  placed: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark served",
};

function Metric({ label, value, caption, icon: Icon, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

function Panel({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export default function Dashboard() {
  const { user, setUser } = useAuth();
  const cart = useCart();
  const [active, setActive] = useState("overview");
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    phone: "",
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState("");
  const [reschedule, setReschedule] = useState(null);
  const [reservationForm, setReservationForm] = useState({
    table_id: "",
    guest_count: 2,
    start_at: dateTimeLocal(90),
    duration_minutes: 120,
    notes: "",
  });
  const [availability, setAvailability] = useState(null);
  const [orderReservation, setOrderReservation] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [menuForm, setMenuForm] = useState({
    name: "",
    category_id: "",
    description: "",
    price: "",
    is_available: true,
  });
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });
  const [reportPeriod, setReportPeriod] = useState("daily");

  async function refreshData(showLoading = false) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const common = await Promise.all([
        request("/menu"),
        request("/categories"),
        request("/tables"),
        request("/reservations"),
        request("/orders"),
        request("/notifications"),
      ]);
      setMenu(common[0]);
      setCategories(common[1]);
      setTables(common[2]);
      setReservations(common[3]);
      setOrders(common[4]);
      setNotifications(common[5]);
      if (user.role === "admin") {
        const [stats, allUsers, reportData] = await Promise.all([
          request("/admin/dashboard"),
          request("/admin/users"),
          request(`/admin/reports?period=${reportPeriod}`),
        ]);
        setDashboard(stats);
        setUsers(allUsers);
        setReports(reportData);
      }
      if (user.role === "customer") {
        const details = await request("/auth/me");
        setProfile(details);
        setReservationForm((current) => ({
          ...current,
          table_id: current.table_id || String(common[2][0]?.id || ""),
        }));
      }
    } catch (issue) {
      setError(issue.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData(true);
  }, [user.role, reportPeriod]);
  useEffect(() => {
    if (user.role !== "kitchen" || !["overview", "history"].includes(active))
      return undefined;
    const timer = window.setInterval(
      () =>
        request("/orders")
          .then(setOrders)
          .catch((issue) => setError(issue.message)),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [user.role, active]);

  async function perform(operation, success) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await operation();
      if (success) setNotice(success);
      await refreshData();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setWorking(false);
    }
  }

  async function checkAvailability() {
    setWorking(true);
    setError("");
    setAvailability(null);
    try {
      const params = new URLSearchParams({
        table_id: reservationForm.table_id,
        guest_count: String(reservationForm.guest_count),
        start_at: reservationForm.start_at,
        duration_minutes: String(reservationForm.duration_minutes),
      });
      setAvailability(await request(`/availability?${params}`));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setWorking(false);
    }
  }

  function printReceipt(order) {
    const rows = order.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.item_name)} × ${item.quantity}</td><td>${money(item.line_total)}</td></tr>`,
      )
      .join("");
    const receipt = `<html><head><title>Tablehouse receipt #${order.id}</title><style>body{font:14px Arial;margin:36px;color:#20251f}h1{font:28px Georgia;margin:0}small{color:#687069}table{width:100%;margin:28px 0;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}.total{font-size:18px;font-weight:bold;text-align:right}</style></head><body><h1>Tablehouse</h1><small>RESTAURANT RECEIPT · ORDER #${order.id}</small><p>${stamp(order.created_at)}</p><table>${rows}</table><p class="total">Total ${money(order.bill?.total ?? order.items.reduce((sum, item) => sum + Number(item.line_total), 0))}</p><p>Thank you. We hope to see you again.</p><script>window.print()<\/script></body></html>`;
    const printWindow = window.open("", "_blank", "width=600,height=760");
    if (printWindow) {
      printWindow.document.write(receipt);
      printWindow.document.close();
    }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  }

  const titleMap = {
    customer: {
      overview: [
        "YOUR TABLE",
        "Good to see you",
        "A little room for the things that matter.",
      ],
      menu: [
        "FROM OUR KITCHEN",
        "Menu & order",
        "Choose a table first, then send your dishes ahead.",
      ],
      reservations: [
        "SAVE YOUR SEAT",
        "Reservations",
        "Book, change or cancel a table.",
      ],
      orders: [
        "AT YOUR TABLE",
        "My orders",
        "Follow your order and settle the bill.",
      ],
      notifications: [
        "A NOTE FROM THE HOUSE",
        "Notifications",
        "Reservation and kitchen updates, all in one place.",
      ],
      profile: [
        "YOUR DETAILS",
        "Profile",
        "Keep your contact details current.",
      ],
    },
    reception: {
      overview: [
        "SERVICE DESK",
        "Floor overview",
        "Today’s bookings and service in one place.",
      ],
      reservations: [
        "THE BOOKING BOOK",
        "Reservations",
        "Confirm arrivals and keep the floor moving.",
      ],
      tables: [
        "THE FLOOR PLAN",
        "Table availability",
        "Adjust seating capacity and take tables in or out of service.",
      ],
      orders: [
        "SERVICE & PAYMENT",
        "Orders & bills",
        "Prepare the bill, then record payment.",
      ],
      walkin: [
        "WELCOME IN",
        "Walk-in order",
        "Build an order for a guest at the door.",
      ],
    },
    kitchen: {
      overview: [
        "LIVE TICKET RAIL",
        "Kitchen queue",
        "New tickets appear automatically every five seconds.",
      ],
      history: [
        "SERVICE RECORD",
        "Completed orders",
        "A quick look at what has left the pass.",
      ],
    },
    admin: {
      overview: [
        "HOUSE PULSE",
        "Good service starts here",
        "A live read on guests, tables and today’s trade.",
      ],
      users: [
        "TEAM & GUESTS",
        "People and roles",
        "Control access for the people who keep the house running.",
      ],
      menu: [
        "THE MENU",
        "Menu & categories",
        "Keep dishes, prices and sections in step.",
      ],
      operations: [
        "THE FLOOR",
        "Restaurant floor",
        "See bookings, tickets and table capacity.",
      ],
      reports: [
        "THE NUMBERS",
        "Restaurant reports",
        "Daily, monthly, popular-item and peak-hour views.",
      ],
    },
  };
  const [eyebrow, heading, detail] =
    titleMap[user.role][active] || titleMap[user.role].overview;

  function pageHeader(action) {
    return (
      <SectionTitle
        eyebrow={eyebrow}
        title={heading}
        detail={detail}
        action={action}
      />
    );
  }

  function customerOverview() {
    const upcoming = reservations
      .filter(
        (item) =>
          ["pending", "confirmed"].includes(item.status) &&
          new Date(String(item.start_at).replace(" ", "T")) >= new Date(),
      )
      .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
    const activeOrders = orders.filter(
      (item) => !["served", "cancelled"].includes(item.status),
    ).length;
    return (
      <>
        <div className="welcome-banner">
          <div>
            <span className="eyebrow light-eyebrow">A TABLEHOUSE HELLO</span>
            <h3>Settle in, {user.name.split(" ")[0]}.</h3>
            <p>
              Good food is better when the little details are taken care of.
            </p>
            <button
              className="button button-paper"
              onClick={() => setActive("menu")}
            >
              Explore the menu <ArrowDownRight size={16} />
            </button>
          </div>
          <div className="banner-illustration" aria-hidden="true">
            <div className="plate plate-outer">
              <div className="plate plate-inner">
                <span>TH</span>
              </div>
            </div>
            <i className="leaf leaf-one" />
            <i className="leaf leaf-two" />
          </div>
        </div>
        <div className="metric-grid">
          <Metric
            label="UPCOMING TABLE"
            value={upcoming ? stamp(upcoming.start_at).split(",")[0] : "—"}
            caption={
              upcoming
                ? `${upcoming.table_number} · ${upcoming.guest_count} guests`
                : "Nothing on the books"
            }
            icon={CalendarClock}
          />
          <Metric
            label="ORDERS IN MOTION"
            value={activeOrders}
            caption="Your current kitchen tickets"
            icon={ShoppingBag}
            tone="metric-sage"
          />
          <Metric
            label="NOTIFICATIONS"
            value={notifications.filter((item) => !item.read_at).length}
            caption="Updates from the restaurant"
            icon={BellIcon}
            tone="metric-ochre"
          />
        </div>
        <div className="split-panels">
          <Panel>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">NEXT UP</span>
                <h3>Your next reservation</h3>
              </div>
              <button
                className="text-button"
                onClick={() => setActive("reservations")}
              >
                All bookings <ArrowUpRight size={15} />
              </button>
            </div>
            {upcoming ? (
              <div className="next-booking">
                <div className="calendar-tile">
                  <strong>
                    {new Intl.DateTimeFormat("en", { day: "2-digit" }).format(
                      new Date(String(upcoming.start_at).replace(" ", "T")),
                    )}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("en", { month: "short" }).format(
                      new Date(String(upcoming.start_at).replace(" ", "T")),
                    )}
                  </span>
                </div>
                <div>
                  <strong>{stamp(upcoming.start_at)}</strong>
                  <p>
                    {upcoming.table_number} · {upcoming.guest_count} guests
                  </p>
                </div>
                <Status value={upcoming.status} />
              </div>
            ) : (
              <EmptyState
                title="No table booked"
                detail="Pick a time and we’ll save you a seat."
              />
            )}
          </Panel>
          <Panel>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">IN THE KITCHEN</span>
                <h3>Latest order</h3>
              </div>
              <button
                className="text-button"
                onClick={() => setActive("orders")}
              >
                Order history <ArrowUpRight size={15} />
              </button>
            </div>
            {orders[0] ? (
              <div className="latest-order">
                <span className="order-stamp">#{orders[0].id}</span>
                <div>
                  <strong>
                    {orders[0].items.map((item) => item.item_name).join(", ")}
                  </strong>
                  <p>{stamp(orders[0].created_at)}</p>
                </div>
                <Status value={orders[0].status} />
              </div>
            ) : (
              <EmptyState
                title="Nothing cooking yet"
                detail="Place a pre-order from the menu."
              />
            )}
          </Panel>
        </div>
      </>
    );
  }

  function menuView() {
    const visible = menu.filter(
      (item) =>
        Number(item.is_available) === 1 &&
        (category === "all" || String(item.category_id) === category) &&
        `${item.name} ${item.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const confirmed = reservations.filter(
      (item) => item.status === "confirmed",
    );
    return (
      <>
        <div className="menu-tools">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Find a dish or ingredient"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="category-tabs">
            <button
              className={category === "all" ? "category-active" : ""}
              onClick={() => setCategory("all")}
            >
              Everything
            </button>
            {categories.map((item) => (
              <button
                key={item.id}
                className={
                  category === String(item.id) ? "category-active" : ""
                }
                onClick={() => setCategory(String(item.id))}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
        <div className="order-builder">
          <div className="dish-grid">
            {visible.map((item) => (
              <article className="dish-item" key={item.id}>
                <div className={`dish-art dish-art-${item.category_id % 4}`}>
                  <span>{item.category}</span>
                  <div className="dish-orb">{item.name.slice(0, 1)}</div>
                </div>
                <div className="dish-copy">
                  <div>
                    <h3>{item.name}</h3>
                    <span className="dish-price">{money(item.price)}</span>
                  </div>
                  <p>{item.description}</p>
                  <button
                    className="add-dish"
                    onClick={() =>
                      cart.add({ ...item, price: Number(item.price) })
                    }
                  >
                    <Plus size={15} /> Add to order
                  </button>
                </div>
              </article>
            ))}
            {!visible.length && (
              <EmptyState
                title="No dishes found"
                detail="Try a different search or menu section."
              />
            )}
          </div>
          <aside className="cart-panel">
            <div className="cart-head">
              <div>
                <span className="eyebrow">THE TABLE</span>
                <h3>
                  Your order <span>{cart.count}</span>
                </h3>
              </div>
              <ShoppingBag size={20} />
            </div>
            {!cart.lines.length ? (
              <EmptyState
                title="Your basket is empty"
                detail="Add a dish from the menu."
              />
            ) : (
              <div className="cart-lines">
                {cart.lines.map((item) => (
                  <div className="cart-line" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{money(item.price)} each</small>
                    </div>
                    <div className="quantity-control">
                      <button
                        aria-label={`Remove one ${item.name}`}
                        onClick={() =>
                          cart.setQuantity(item.id, item.quantity - 1)
                        }
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        aria-label={`Add one ${item.name}`}
                        onClick={() =>
                          cart.setQuantity(item.id, item.quantity + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="cart-total">
              <span>Estimated total</span>
              <strong>{money(cart.total)}</strong>
            </div>
            <label className="field-label">
              For reservation
              <select
                value={orderReservation}
                onChange={(event) => setOrderReservation(event.target.value)}
              >
                <option value="">Choose a confirmed table</option>
                {confirmed.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.table_number} · {stamp(item.start_at)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-dark full-width"
              disabled={working || !cart.lines.length || !orderReservation}
              onClick={() =>
                perform(async () => {
                  await request("/orders", {
                    method: "POST",
                    body: {
                      reservation_id: Number(orderReservation),
                      items: cart.lines.map((item) => ({
                        menu_item_id: item.id,
                        quantity: item.quantity,
                      })),
                    },
                  });
                  cart.clear();
                  setOrderReservation("");
                  setActive("orders");
                }, "Pre-order sent to the kitchen.")
              }
            >
              {working ? "Sending…" : "Place pre-order"}
              <ArrowDownRight size={16} />
            </button>
            <small className="cart-footnote">
              Prices are confirmed by the restaurant when your order is placed.
            </small>
          </aside>
        </div>
      </>
    );
  }

  function reservationView() {
    return (
      <>
        <Panel className="booking-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BOOK A TABLE</span>
              <h3>Make it an evening</h3>
            </div>
            <CalendarClock size={20} />
          </div>
          <form
            className="booking-form"
            onSubmit={(event) => {
              event.preventDefault();
              perform(async () => {
                const saved = await request("/reservations", {
                  method: "POST",
                  body: {
                    ...reservationForm,
                    table_id: Number(reservationForm.table_id),
                    guest_count: Number(reservationForm.guest_count),
                    duration_minutes: Number(reservationForm.duration_minutes),
                  },
                });
                setReservationForm({ ...reservationForm, notes: "" });
                setNotice(
                  `Reservation ${saved.status}. Reception will confirm your table.`,
                );
              }, "Reservation requested.");
            }}
          >
            <label>
              Day & arrival
              <input
                type="datetime-local"
                value={reservationForm.start_at}
                min={dateTimeLocal(0)}
                onChange={(event) =>
                  setReservationForm({
                    ...reservationForm,
                    start_at: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              Table
              <select
                value={reservationForm.table_id}
                onChange={(event) =>
                  setReservationForm({
                    ...reservationForm,
                    table_id: event.target.value,
                  })
                }
                required
              >
                <option value="">Select a table</option>
                {tables
                  .filter((table) => Number(table.is_active) === 1)
                  .map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.table_number} · {table.capacity} seats ·{" "}
                      {table.area}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Guests
              <input
                type="number"
                min="1"
                max="30"
                value={reservationForm.guest_count}
                onChange={(event) =>
                  setReservationForm({
                    ...reservationForm,
                    guest_count: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              Duration
              <select
                value={reservationForm.duration_minutes}
                onChange={(event) =>
                  setReservationForm({
                    ...reservationForm,
                    duration_minutes: event.target.value,
                  })
                }
              >
                <option value="90">90 minutes</option>
                <option value="120">2 hours</option>
                <option value="150">2½ hours</option>
                <option value="180">3 hours</option>
              </select>
            </label>
            <label className="booking-notes">
              A note for the house
              <input
                maxLength="500"
                value={reservationForm.notes}
                onChange={(event) =>
                  setReservationForm({
                    ...reservationForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Occasion, access needs, seating preference…"
              />
            </label>
            <button
              className="button button-outline"
              type="button"
              disabled={working || !reservationForm.table_id}
              onClick={checkAvailability}
            >
              Check availability <CalendarClock size={15} />
            </button>
            <button className="button button-dark" disabled={working}>
              Request table <ArrowDownRight size={16} />
            </button>
            {availability && (
              <p
                className={`availability-result ${availability.available ? "availability-open" : "availability-busy"}`}
              >
                {availability.available
                  ? `${availability.table.table_number} is available for this time.`
                  : availability.reason}
              </p>
            )}
          </form>
        </Panel>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR BOOKINGS</span>
              <h3>On the books</h3>
            </div>
            <span className="subtle-count">{reservations.length} total</span>
          </div>
          <Table
            rows={reservations}
            empty="Your future bookings will appear here."
            columns={[
              {
                key: "start_at",
                label: "When",
                render: (item) => <strong>{stamp(item.start_at)}</strong>,
              },
              {
                key: "table_number",
                label: "Table",
                render: (item) =>
                  `${item.table_number} · ${item.guest_count} guests`,
              },
              {
                key: "status",
                label: "Status",
                render: (item) => <Status value={item.status} />,
              },
              {
                key: "actions",
                label: "",
                render: (item) =>
                  ["pending", "confirmed"].includes(item.status) ? (
                    <div className="row-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          setReschedule(item);
                          setModal("reschedule");
                        }}
                      >
                        Change time
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() =>
                          perform(
                            () =>
                              request(`/reservations/${item.id}`, {
                                method: "PATCH",
                                body: { action: "cancel" },
                              }),
                            "Reservation cancelled.",
                          )
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </Panel>
        <Modal
          open={modal === "reschedule"}
          title="Move your reservation"
          onClose={() => setModal("")}
        >
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              perform(async () => {
                await request(`/reservations/${reschedule.id}`, {
                  method: "PATCH",
                  body: {
                    action: "reschedule",
                    table_id: Number(reschedule.table_id),
                    start_at: reschedule.start_at,
                    duration_minutes: 120,
                  },
                });
                setModal("");
              }, "Reservation updated.");
            }}
          >
            <label>
              New arrival
              <input
                type="datetime-local"
                min={dateTimeLocal(0)}
                value={
                  reschedule
                    ? reschedule.start_at.replace(" ", "T").slice(0, 16)
                    : ""
                }
                onChange={(event) =>
                  setReschedule({ ...reschedule, start_at: event.target.value })
                }
                required
              />
            </label>
            <label>
              Table
              <select
                value={reschedule?.table_id || ""}
                onChange={(event) =>
                  setReschedule({ ...reschedule, table_id: event.target.value })
                }
              >
                {tables
                  .filter((table) => Number(table.is_active) === 1)
                  .map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.table_number} · {table.capacity} seats
                    </option>
                  ))}
              </select>
            </label>
            <button className="button button-dark" disabled={working}>
              Save changes
            </button>
          </form>
        </Modal>
      </>
    );
  }

  function customerOrders() {
    return orders.length ? (
      <div className="record-list">
        {orders.map((order) => (
          <Panel key={order.id} className="record-panel">
            <div className="record-top">
              <div>
                <span className="eyebrow">
                  ORDER #{order.id} · {stamp(order.created_at)}
                </span>
                <h3>
                  {order.items
                    .map((item) => `${item.quantity} × ${item.item_name}`)
                    .join(" · ")}
                </h3>
              </div>
              <Status value={order.status} />
            </div>
            <div className="record-bottom">
              <span>
                {order.table_number
                  ? `Table ${order.table_number}`
                  : "Restaurant order"}{" "}
                ·{" "}
                {money(
                  order.items.reduce(
                    (sum, item) => sum + Number(item.line_total),
                    0,
                  ),
                )}
              </span>
              <div className="row-actions">
                {order.bill && (
                  <>
                    <strong>{money(order.bill.total)}</strong>
                    {order.bill.payment_status === "paid" ? (
                      <Status value="paid" />
                    ) : (
                      <button
                        className="button button-dark button-small"
                        disabled={working}
                        onClick={() =>
                          perform(
                            () =>
                              request("/payments", {
                                method: "POST",
                                body: {
                                  order_id: order.id,
                                  method: "simulated",
                                  idempotency_key: crypto.randomUUID(),
                                },
                              }),
                            "Simulated payment completed.",
                          )
                        }
                      >
                        Pay bill
                      </button>
                    )}
                  </>
                )}
                {order.bill?.payment_status === "paid" && (
                  <button
                    className="icon-button"
                    aria-label="Print receipt"
                    onClick={() => printReceipt(order)}
                  >
                    <Printer size={17} />
                  </button>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    ) : (
      <Panel>
        <EmptyState
          title="No orders yet"
          detail="A confirmed reservation lets you order ahead."
        />
      </Panel>
    );
  }

  function profileView() {
    return (
      <Panel className="profile-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACCOUNT DETAILS</span>
            <h3>Your profile</h3>
          </div>
          <Users size={20} />
        </div>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            perform(async () => {
              const updated = await request("/profile", {
                method: "PATCH",
                body: { name: profile.name, phone: profile.phone },
              });
              setUser({ ...user, name: updated.name });
              setProfile({ ...profile, ...updated });
            }, "Profile saved.");
          }}
        >
          <label>
            Full name
            <input
              value={profile.name || ""}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
              minLength="2"
              maxLength="120"
              required
            />
          </label>
          <label>
            Email address
            <input value={profile.email || ""} disabled />
          </label>
          <label>
            Phone
            <input
              value={profile.phone || ""}
              onChange={(event) =>
                setProfile({ ...profile, phone: event.target.value })
              }
              maxLength="30"
            />
          </label>
          <button className="button button-dark" disabled={working}>
            Save profile <Check size={16} />
          </button>
        </form>
      </Panel>
    );
  }

  function notificationsView() {
    return (
      <Panel>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RECENT UPDATES</span>
            <h3>Notes from the house</h3>
          </div>
          <span className="subtle-count">{notifications.length} messages</span>
        </div>
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((item) => (
              <article className="notification-row" key={item.id}>
                <span
                  className={`notification-mark ${item.read_at ? "" : "notification-unread"}`}
                />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>{stamp(item.created_at)}</small>
                </div>
                {!item.read_at && (
                  <button
                    className="text-button"
                    onClick={() =>
                      perform(
                        () =>
                          request(`/notifications/${item.id}`, {
                            method: "PATCH",
                            body: {},
                          }),
                        "Notification marked as read.",
                      )
                    }
                  >
                    Mark read
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No messages yet"
            detail="Reservation and order updates will appear here."
          />
        )}
      </Panel>
    );
  }

  function receptionOverview() {
    const today = reservations.filter(
      (item) =>
        String(item.start_at).slice(0, 10) ===
        new Date().toISOString().slice(0, 10),
    );
    return (
      <>
        <div className="metric-grid">
          <Metric
            label="TODAY'S BOOKINGS"
            value={today.length}
            caption="Arrivals on the books"
            icon={CalendarClock}
          />
          <Metric
            label="WAITING CONFIRMATION"
            value={
              reservations.filter((item) => item.status === "pending").length
            }
            caption="Requests to review"
            icon={Clock3}
            tone="metric-ochre"
          />
          <Metric
            label="OPEN TICKETS"
            value={
              orders.filter(
                (item) => !["served", "cancelled"].includes(item.status),
              ).length
            }
            caption="Orders still in service"
            icon={ShoppingBag}
            tone="metric-sage"
          />
        </div>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TODAY AT A GLANCE</span>
              <h3>Reservations & arrivals</h3>
            </div>
            <button
              className="text-button"
              onClick={() => setActive("reservations")}
            >
              Open bookings <ArrowUpRight size={15} />
            </button>
          </div>
          <Table
            rows={today}
            empty="There are no reservations today."
            columns={[
              {
                key: "start_at",
                label: "Arrival",
                render: (item) => stamp(item.start_at),
              },
              { key: "guest_name", label: "Guest" },
              {
                key: "table_number",
                label: "Table",
                render: (item) =>
                  `${item.table_number} · ${item.guest_count} guests`,
              },
              {
                key: "status",
                label: "Status",
                render: (item) => <Status value={item.status} />,
              },
            ]}
          />
        </Panel>
      </>
    );
  }

  function receptionReservations() {
    return (
      <Panel>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ALL BOOKINGS</span>
            <h3>Reservation book</h3>
          </div>
          <button
            className="icon-button"
            title="Refresh reservations"
            onClick={() => refreshData()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <Table
          rows={reservations}
          empty="No bookings have been made yet."
          columns={[
            {
              key: "start_at",
              label: "Arrival",
              render: (item) => <strong>{stamp(item.start_at)}</strong>,
            },
            {
              key: "guest_name",
              label: "Guest",
              render: (item) => (
                <>
                  <strong>{item.guest_name}</strong>
                  <small className="table-subline">{item.email}</small>
                </>
              ),
            },
            {
              key: "table_number",
              label: "Table",
              render: (item) => `${item.table_number} · ${item.guest_count}`,
            },
            {
              key: "status",
              label: "Status",
              render: (item) => <Status value={item.status} />,
            },
            {
              key: "actions",
              label: "Action",
              render: (item) =>
                item.status === "pending" ? (
                  <button
                    className="button button-small button-dark"
                    onClick={() =>
                      perform(
                        () =>
                          request(`/reservations/${item.id}`, {
                            method: "PATCH",
                            body: { action: "confirm" },
                          }),
                        "Reservation confirmed.",
                      )
                    }
                  >
                    Confirm
                  </button>
                ) : item.status === "confirmed" ? (
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      perform(
                        () =>
                          request(`/reservations/${item.id}`, {
                            method: "PATCH",
                            body: { action: "cancel" },
                          }),
                        "Reservation cancelled.",
                      )
                    }
                  >
                    Cancel
                  </button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>
    );
  }

  function tablesView() {
    return (
      <Panel>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SEATING PLAN</span>
            <h3>Table capacity & service</h3>
          </div>
        </div>
        <div className="table-admin-grid">
          {tables.map((table) => (
            <article className="table-admin" key={table.id}>
              <span className="table-admin-no">{table.table_number}</span>
              <label>
                Seats
                <input
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={table.capacity}
                  onBlur={(event) => {
                    const capacity = Number(event.target.value);
                    if (capacity !== Number(table.capacity))
                      perform(
                        () =>
                          request(`/tables/${table.id}`, {
                            method: "PATCH",
                            body: {
                              capacity,
                              is_active: Number(table.is_active) === 1,
                            },
                          }),
                        `${table.table_number} capacity updated.`,
                      );
                  }}
                />
              </label>
              <button
                className={`toggle ${Number(table.is_active) === 1 ? "toggle-on" : ""}`}
                onClick={() =>
                  perform(
                    () =>
                      request(`/tables/${table.id}`, {
                        method: "PATCH",
                        body: {
                          capacity: Number(table.capacity),
                          is_active: Number(table.is_active) !== 1,
                        },
                      }),
                    "Table availability updated.",
                  )
                }
              >
                {Number(table.is_active) === 1 ? "Available" : "Closed"}
              </button>
            </article>
          ))}
        </div>
      </Panel>
    );
  }

  function receptionOrders() {
    const filtered = orders.filter((item) =>
      `${item.id} ${item.customer_name || ""} ${item.status}`
        .toLowerCase()
        .includes(orderSearch.toLowerCase()),
    );
    return (
      <>
        <label className="search-input compact-search">
          <Search size={16} />
          <input
            placeholder="Search order or guest"
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
          />
        </label>
        <div className="record-list">
          {filtered.map((order) => (
            <Panel key={order.id} className="record-panel">
              <div className="record-top">
                <div>
                  <span className="eyebrow">
                    ORDER #{order.id} · {stamp(order.created_at)}
                  </span>
                  <h3>
                    {order.customer_name || "Walk-in guest"}
                    {order.table_number && ` · Table ${order.table_number}`}
                  </h3>
                  <p>
                    {order.items
                      .map((item) => `${item.quantity} × ${item.item_name}`)
                      .join(" · ")}
                  </p>
                </div>
                <Status value={order.status} />
              </div>
              <div className="record-bottom">
                <span>
                  {order.bill
                    ? `Bill ${money(order.bill.total)}`
                    : `${money(order.items.reduce((sum, item) => sum + Number(item.line_total), 0))} · not billed`}
                </span>
                <div className="row-actions">
                  {!order.bill && (
                    <button
                      className="button button-small button-outline"
                      disabled={working}
                      onClick={() =>
                        perform(
                          () =>
                            request("/bills", {
                              method: "POST",
                              body: { order_id: order.id },
                            }),
                          "Bill generated.",
                        )
                      }
                    >
                      Generate bill
                    </button>
                  )}
                  {order.bill?.payment_status === "paid" ? (
                    <>
                      <Status value="paid" />
                      <button
                        className="icon-button"
                        aria-label="Print receipt"
                        onClick={() => printReceipt(order)}
                      >
                        <Printer size={17} />
                      </button>
                    </>
                  ) : (
                    order.bill && (
                      <button
                        className="button button-small button-dark"
                        disabled={working}
                        onClick={() =>
                          perform(
                            () =>
                              request("/payments", {
                                method: "POST",
                                body: {
                                  order_id: order.id,
                                  method: "simulated",
                                  idempotency_key: crypto.randomUUID(),
                                },
                              }),
                            "Payment recorded.",
                          )
                        }
                      >
                        Record payment
                      </button>
                    )
                  )}
                </div>
              </div>
            </Panel>
          ))}
          {!filtered.length && (
            <Panel>
              <EmptyState
                title="No matching orders"
                detail="New orders will appear here."
              />
            </Panel>
          )}
        </div>
      </>
    );
  }

  function walkInView() {
    const visibleMenu = menu.filter(
      (item) =>
        Number(item.is_available) === 1 &&
        item.name.toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <div className="walkin-layout">
        <Panel className="walkin-menu">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BUILD A TICKET</span>
              <h3>Choose dishes</h3>
            </div>
            <label className="search-input small-search">
              <Search size={15} />
              <input
                placeholder="Find a dish"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="walkin-dishes">
            {visibleMenu.map((item) => (
              <button
                className="walkin-dish"
                key={item.id}
                onClick={() => cart.add({ ...item, price: Number(item.price) })}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.category} · {money(item.price)}
                  </small>
                </span>
                <Plus size={16} />
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="walkin-checkout">
          <span className="eyebrow">WALK-IN GUEST</span>
          <h3>Order summary</h3>
          <label className="field-label">
            Customer ID <span className="optional">OPTIONAL</span>
            <input
              type="number"
              min="1"
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Leave blank for walk-in"
            />
          </label>
          <div className="cart-lines">
            {cart.lines.map((item) => (
              <div className="cart-line" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{money(item.price)} each</small>
                </div>
                <div className="quantity-control">
                  <button
                    onClick={() => cart.setQuantity(item.id, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => cart.setQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-total">
            <span>Estimated total</span>
            <strong>{money(cart.total)}</strong>
          </div>
          <button
            className="button button-dark full-width"
            disabled={!cart.count || working}
            onClick={() =>
              perform(async () => {
                await request("/orders", {
                  method: "POST",
                  body: {
                    customer_id: orderSearch ? Number(orderSearch) : undefined,
                    items: cart.lines.map((item) => ({
                      menu_item_id: item.id,
                      quantity: item.quantity,
                    })),
                  },
                });
                cart.clear();
                setOrderSearch("");
                setActive("orders");
              }, "Walk-in order sent to the kitchen.")
            }
          >
            Send to kitchen <ArrowDownRight size={16} />
          </button>
        </Panel>
      </div>
    );
  }

  function kitchenView(completed = false) {
    const queue = orders
      .filter((order) =>
        completed
          ? ["served", "cancelled"].includes(order.status)
          : !["served", "cancelled"].includes(order.status),
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return (
      <>
        <div className="kitchen-status">
          <span>
            <i className="service-dot" /> LIVE QUEUE
          </span>
          <span>Refreshes every 5 seconds</span>
        </div>
        {queue.length ? (
          <div className="ticket-grid">
            {queue.map((order, index) => (
              <article
                className={`ticket ${order.status === "ready" ? "ticket-ready" : ""}`}
                key={order.id}
              >
                <div className="ticket-top">
                  <span className="ticket-number">
                    #{String(order.id).padStart(3, "0")}
                  </span>
                  <Status value={order.status} />
                </div>
                <div className="ticket-meta">
                  <span>
                    {order.table_number
                      ? `TABLE ${order.table_number}`
                      : "WALK-IN"}
                  </span>
                  <span>{stamp(order.created_at)}</span>
                </div>
                <ul>
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.quantity}×</strong>
                      <span>{item.item_name}</span>
                    </li>
                  ))}
                </ul>
                {order.notes && <p className="ticket-note">{order.notes}</p>}
                {!completed && statusNext[order.status] && (
                  <button
                    className={`button ${order.status === "ready" ? "button-olive" : "button-dark"} full-width`}
                    disabled={working}
                    onClick={() =>
                      perform(
                        () =>
                          request(`/orders/${order.id}`, {
                            method: "PATCH",
                            body: { status: statusNext[order.status] },
                          }),
                        `Order #${order.id} marked ${statusNext[order.status]}.`,
                      )
                    }
                  >
                    {statusLabel[order.status]}
                    <ArrowDownRight size={15} />
                  </button>
                )}
                {completed && (
                  <div className="ticket-finished">Ticket complete</div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Panel>
            <EmptyState
              title={completed ? "No completed tickets" : "The pass is clear"}
              detail={
                completed
                  ? "Served orders will be listed here."
                  : "New orders will appear automatically."
              }
            />
          </Panel>
        )}
      </>
    );
  }

  function adminOverview() {
    return (
      <>
        <div className="metric-grid">
          <Metric
            label="ACTIVE GUESTS"
            value={dashboard?.customers ?? "—"}
            caption="Customer accounts"
            icon={Users}
          />
          <Metric
            label="TODAY'S BOOKINGS"
            value={dashboard?.today_reservations ?? "—"}
            caption="Reservations on the books"
            icon={CalendarClock}
            tone="metric-sage"
          />
          <Metric
            label="OPEN ORDERS"
            value={dashboard?.active_orders ?? "—"}
            caption="Placed, preparing or ready"
            icon={ChefHat}
            tone="metric-ochre"
          />
          <Metric
            label="TODAY'S TAKINGS"
            value={money(dashboard?.today_revenue)}
            caption="Recorded payments"
            icon={CircleDollarSign}
          />
        </div>
        <div className="split-panels">
          <Panel>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">THE FLOOR</span>
                <h3>Table availability</h3>
              </div>
              <button
                className="text-button"
                onClick={() => setActive("operations")}
              >
                Manage floor <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="table-grid">
              {(dashboard?.tables || tables).map((table) => (
                <div
                  className={`table-chip ${Number(table.is_active) === 1 ? "" : "table-off"}`}
                  key={table.id}
                >
                  <span>{table.table_number}</span>
                  <small>
                    {table.capacity} seats · {table.area}
                  </small>
                  <i>{Number(table.is_active) === 1 ? "ACTIVE" : "OFFLINE"}</i>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">POPULAR THIS HOUSE</span>
                <h3>Top ordered</h3>
              </div>
            </div>
            {reports?.popular_items?.slice(0, 5).map((item, index) => (
              <div className="ranking-row" key={item.item_name}>
                <span className="rank-number">0{index + 1}</span>
                <strong>{item.item_name}</strong>
                <span>{item.quantity} ordered</span>
              </div>
            ))}
          </Panel>
        </div>
      </>
    );
  }

  function adminUsers() {
    return (
      <Panel>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACCOUNT DIRECTORY</span>
            <h3>People & access</h3>
          </div>
          <span className="subtle-count">{users.length} accounts</span>
        </div>
        <Table
          rows={users}
          empty="No accounts found."
          columns={[
            {
              key: "name",
              label: "Person",
              render: (item) => (
                <>
                  <strong>{item.name}</strong>
                  <small className="table-subline">{item.email}</small>
                </>
              ),
            },
            {
              key: "role",
              label: "Role",
              render: (item) => (
                <select
                  className="table-select"
                  value={item.role}
                  onChange={(event) =>
                    perform(
                      () =>
                        request(`/admin/users/${item.id}`, {
                          method: "PATCH",
                          body: {
                            role: event.target.value,
                            is_active: item.is_active,
                          },
                        }),
                      "Role updated.",
                    )
                  }
                >
                  <option value="customer">Customer</option>
                  <option value="reception">Reception</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="admin">Administrator</option>
                </select>
              ),
            },
            {
              key: "is_active",
              label: "Access",
              render: (item) => (
                <button
                  className={`toggle ${Number(item.is_active) === 1 ? "toggle-on" : ""}`}
                  aria-label={`${Number(item.is_active) === 1 ? "Disable" : "Enable"} ${item.name}`}
                  onClick={() =>
                    perform(
                      () =>
                        request(`/admin/users/${item.id}`, {
                          method: "PATCH",
                          body: {
                            role: item.role,
                            is_active: Number(item.is_active) !== 1,
                          },
                        }),
                      "Account access updated.",
                    )
                  }
                >
                  {Number(item.is_active) === 1 ? "Active" : "Disabled"}
                </button>
              ),
            },
            {
              key: "created_at",
              label: "Joined",
              render: (item) => stamp(item.created_at).split(",")[0],
            },
          ]}
        />
      </Panel>
    );
  }

  function adminMenu() {
    return (
      <>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CURRENT OFFERING</span>
              <h3>Menu items</h3>
            </div>
            <button
              className="button button-dark button-small"
              onClick={() => setModal("menu-item")}
            >
              <Plus size={15} /> Add dish
            </button>
          </div>
          <Table
            rows={menu}
            empty="Add a category and menu items to get started."
            columns={[
              {
                key: "name",
                label: "Dish",
                render: (item) => (
                  <>
                    <strong>{item.name}</strong>
                    <small className="table-subline">{item.description}</small>
                  </>
                ),
              },
              { key: "category", label: "Section" },
              {
                key: "price",
                label: "Price",
                render: (item) => money(item.price),
              },
              {
                key: "is_available",
                label: "Availability",
                render: (item) => (
                  <div className="row-actions menu-admin-actions">
                    <Status
                      value={
                        Number(item.is_available) === 1
                          ? "available"
                          : "unavailable"
                      }
                    />
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditingMenuId(item.id);
                        setMenuForm({
                          name: item.name,
                          category_id: String(item.category_id),
                          description: item.description,
                          price: String(item.price),
                          is_available: Number(item.is_available) === 1,
                        });
                        setModal("menu-item");
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MENU SECTIONS</span>
              <h3>Categories</h3>
            </div>
            <button
              className="button button-outline button-small"
              onClick={() => setModal("category")}
            >
              <Plus size={15} /> Add category
            </button>
          </div>
          <div className="category-list">
            {categories.map((item) => (
              <div key={item.id}>
                <span>{item.name}</span>
                <small>{item.description || "No description"}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Modal
          open={modal === "menu-item"}
          title={editingMenuId ? "Edit a menu item" : "Add a menu item"}
          onClose={() => setModal("")}
        >
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              perform(
                async () => {
                  await request(
                    editingMenuId ? `/menu/${editingMenuId}` : "/menu",
                    {
                      method: editingMenuId ? "PATCH" : "POST",
                      body: {
                        ...menuForm,
                        category_id: Number(menuForm.category_id),
                        price: Number(menuForm.price),
                      },
                    },
                  );
                  setMenuForm({
                    name: "",
                    category_id: "",
                    description: "",
                    price: "",
                    is_available: true,
                  });
                  setEditingMenuId(null);
                  setModal("");
                },
                editingMenuId ? "Menu item updated." : "Menu item added.",
              );
            }}
          >
            <label>
              Dish name
              <input
                value={menuForm.name}
                onChange={(event) =>
                  setMenuForm({ ...menuForm, name: event.target.value })
                }
                maxLength="120"
                required
              />
            </label>
            <label>
              Category
              <select
                value={menuForm.category_id}
                onChange={(event) =>
                  setMenuForm({ ...menuForm, category_id: event.target.value })
                }
                required
              >
                <option value="">Choose section</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                value={menuForm.description}
                onChange={(event) =>
                  setMenuForm({ ...menuForm, description: event.target.value })
                }
                maxLength="500"
              />
            </label>
            <label>
              Price (INR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={menuForm.price}
                onChange={(event) =>
                  setMenuForm({ ...menuForm, price: event.target.value })
                }
                required
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={menuForm.is_available}
                onChange={(event) =>
                  setMenuForm({
                    ...menuForm,
                    is_available: event.target.checked,
                  })
                }
              />
              Available to order
            </label>
            <button className="button button-dark" disabled={working}>
              {editingMenuId ? "Save menu item" : "Add to menu"}
            </button>
          </form>
        </Modal>
        <Modal
          open={modal === "category"}
          title="Add a menu category"
          onClose={() => setModal("")}
        >
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              perform(async () => {
                await request("/categories", {
                  method: "POST",
                  body: categoryForm,
                });
                setCategoryForm({ name: "", description: "" });
                setModal("");
              }, "Category added.");
            }}
          >
            <label>
              Category name
              <input
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, name: event.target.value })
                }
                maxLength="80"
                required
              />
            </label>
            <label>
              Description
              <input
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: event.target.value,
                  })
                }
                maxLength="255"
              />
            </label>
            <button className="button button-dark">Add category</button>
          </form>
        </Modal>
      </>
    );
  }

  function adminOperations() {
    return (
      <>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SEATING PLAN</span>
              <h3>Tables & availability</h3>
            </div>
          </div>
          <div className="table-admin-grid">
            {tables.map((table) => (
              <article className="table-admin" key={table.id}>
                <span className="table-admin-no">{table.table_number}</span>
                <label>
                  Seats
                  <input
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={table.capacity}
                    onBlur={(event) => {
                      const capacity = Number(event.target.value);
                      if (capacity !== Number(table.capacity))
                        perform(
                          () =>
                            request(`/tables/${table.id}`, {
                              method: "PATCH",
                              body: {
                                capacity,
                                is_active: Boolean(Number(table.is_active)),
                              },
                            }),
                          `${table.table_number} capacity updated.`,
                        );
                    }}
                  />
                </label>
                <button
                  className={`toggle ${table.is_active ? "toggle-on" : ""}`}
                  onClick={() =>
                    perform(
                      () =>
                        request(`/tables/${table.id}`, {
                          method: "PATCH",
                          body: {
                            capacity: Number(table.capacity),
                            is_active: !Boolean(Number(table.is_active)),
                          },
                        }),
                      "Table availability updated.",
                    )
                  }
                >
                  {table.is_active ? "Available" : "Closed"}
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">LIVE OPERATIONS</span>
              <h3>Reservations & orders</h3>
            </div>
          </div>
          <div className="split-panels inner-split">
            <div>
              <h4 className="mini-heading">Bookings</h4>
              <Table
                rows={reservations.slice(0, 8)}
                empty="No reservations yet."
                columns={[
                  {
                    key: "start_at",
                    label: "Time",
                    render: (item) => stamp(item.start_at),
                  },
                  { key: "guest_name", label: "Guest" },
                  {
                    key: "status",
                    label: "State",
                    render: (item) => <Status value={item.status} />,
                  },
                  {
                    key: "bill",
                    label: "Bill / payment",
                    render: (item) =>
                      item.bill
                        ? `${money(item.bill.total)} · ${item.bill.payment_status || "unpaid"}`
                        : "Not billed",
                  },
                ]}
              />
            </div>
            <div>
              <h4 className="mini-heading">Recent orders</h4>
              <Table
                rows={orders.slice(0, 8)}
                empty="No orders yet."
                columns={[
                  {
                    key: "id",
                    label: "Ticket",
                    render: (item) => `#${item.id}`,
                  },
                  {
                    key: "customer_name",
                    label: "Guest",
                    render: (item) => item.customer_name || "Walk-in",
                  },
                  {
                    key: "status",
                    label: "State",
                    render: (item) => <Status value={item.status} />,
                  },
                ]}
              />
            </div>
          </div>
        </Panel>
      </>
    );
  }

  function adminReports() {
    return (
      <>
        <div className="report-selector">
          <div>
            <span className="eyebrow">TRADE & SERVICE</span>
            <h3>Reporting window</h3>
          </div>
          <div className="segmented">
            <button
              className={reportPeriod === "daily" ? "selected" : ""}
              onClick={() => setReportPeriod("daily")}
            >
              Daily
            </button>
            <button
              className={reportPeriod === "monthly" ? "selected" : ""}
              onClick={() => setReportPeriod("monthly")}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="report-grid">
          <Panel>
            <span className="eyebrow">DAILY REVENUE · LAST 30 DAYS</span>
            <h3>Day by day</h3>
            <Table
              rows={reports?.daily || []}
              empty="Payments will populate the daily report."
              columns={[
                { key: "label", label: "Date" },
                { key: "payments", label: "Bills paid" },
                {
                  key: "revenue",
                  label: "Revenue",
                  render: (item) => money(item.revenue),
                },
              ]}
            />
          </Panel>
          <Panel>
            <span className="eyebrow">MONTHLY REVENUE · LAST 12 MONTHS</span>
            <h3>Month by month</h3>
            <Table
              rows={reports?.monthly || []}
              empty="Payments will populate the monthly report."
              columns={[
                { key: "label", label: "Month" },
                { key: "payments", label: "Bills paid" },
                {
                  key: "revenue",
                  label: "Revenue",
                  render: (item) => money(item.revenue),
                },
              ]}
            />
          </Panel>
          <Panel>
            <span className="eyebrow">GUEST FAVOURITES</span>
            <h3>Popular items</h3>
            <Table
              rows={reports?.popular_items || []}
              empty="Order items will appear here."
              columns={[
                { key: "item_name", label: "Dish" },
                { key: "quantity", label: "Quantity" },
                {
                  key: "revenue",
                  label: "Revenue",
                  render: (item) => money(item.revenue),
                },
              ]}
            />
          </Panel>
          <Panel>
            <span className="eyebrow">WHEN THE HOUSE IS BUSIEST</span>
            <h3>Peak order hours</h3>
            <Table
              rows={reports?.peak_hours || []}
              empty="Order times will appear here."
              columns={[
                {
                  key: "hour",
                  label: "Hour",
                  render: (item) => `${String(item.hour).padStart(2, "0")}:00`,
                },
                { key: "orders", label: "Orders" },
              ]}
            />
          </Panel>
        </div>
      </>
    );
  }

  function content() {
    if (loading) return <Loading label="Setting the table" />;
    if (user.role === "customer")
      return active === "overview"
        ? customerOverview()
        : active === "menu"
          ? menuView()
          : active === "reservations"
            ? reservationView()
            : active === "orders"
              ? customerOrders()
              : active === "notifications"
                ? notificationsView()
                : profileView();
    if (user.role === "reception")
      return active === "overview"
        ? receptionOverview()
        : active === "reservations"
          ? receptionReservations()
          : active === "tables"
            ? tablesView()
            : active === "orders"
              ? receptionOrders()
              : walkInView();
    if (user.role === "kitchen") return kitchenView(active === "history");
    return active === "overview"
      ? adminOverview()
      : active === "users"
        ? adminUsers()
        : active === "menu"
          ? adminMenu()
          : active === "operations"
            ? adminOperations()
            : adminReports();
  }

  return (
    <Shell active={active} onNavigate={setActive}>
      <div className="page-heading-row">
        {pageHeader(
          <button
            className="icon-button refresh-button"
            aria-label="Refresh data"
            title="Refresh data"
            onClick={() => refreshData()}
          >
            <RefreshCw size={17} />
          </button>,
        )}
      </div>
      <Alert>{error}</Alert>
      <Alert type="success" onClose={() => setNotice("")}>
        {notice}
      </Alert>
      {content()}
    </Shell>
  );
}

function BellIcon(props) {
  return (
    <span className="bell-wrap">
      <Clock3 {...props} />
    </span>
  );
}
