import { useEffect } from "react";
import { X } from "lucide-react";

export function Loading({ label = "Loading" }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">—</span>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function Status({ value }) {
  const state = String(value || "pending").toLowerCase();
  return (
    <span className={`status status-${state}`}>{state.replace("_", " ")}</span>
  );
}

export function Alert({ type = "error", children, onClose }) {
  if (!children) return null;
  return (
    <div
      className={`alert alert-${type}`}
      role={type === "error" ? "alert" : "status"}
    >
      <span>{children}</span>
      {onClose && (
        <button
          className="icon-button alert-close"
          aria-label="Dismiss message"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, detail, action }) {
  return (
    <div className="section-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ columns, rows, empty = "Nothing to show yet." }) {
  if (!rows.length) return <EmptyState title="No records yet" detail={empty} />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
      >
        <div className="modal-heading">
          <h2 id="modal-heading">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
