import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Utensils } from "lucide-react";
import { Alert } from "../components/UI";
import { useAuth } from "../context/AuthContext";

const demos = [
  ["customer", "Guest", "customer@tablehouse.test"],
  ["reception", "Reception", "reception@tablehouse.test"],
  ["kitchen", "Kitchen", "kitchen@tablehouse.test"],
  ["admin", "Admin", "admin@tablehouse.test"],
];

export default function AuthPage({ register = false }) {
  const { signIn, register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (register) await createAccount(form);
      else await signIn({ email: form.email, password: form.password });
      navigate("/app", { replace: true });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="story-grain" />
        <div className="story-brand">
          <span className="brand-stamp brand-stamp-light">
            T<span>.</span>
          </span>
          <span>TABLEHOUSE</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow light-eyebrow">
            GOOD FOOD. A WELL-KEPT HOUSE.
          </span>
          <h1>
            Make room
            <br />
            for <em>something</em>
            <br />
            good.
          </h1>
          <p>
            One calm place to welcome guests, find a table and keep the kitchen
            moving.
          </p>
        </div>
        <div className="story-footer">
          <span>
            <Utensils size={15} /> Seasonal kitchen, open daily
          </span>
          <span>LOCAL RESTAURANT SYSTEM</span>
        </div>
        <div className="story-orbit orbit-one" />
        <div className="story-orbit orbit-two" />
      </section>
      <section className="auth-panel">
        <div className="auth-top">
          <span>YOUR TABLE IS WAITING</span>
          <span className="open-label">
            <i /> OPEN
          </span>
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {register ? "A seat at the table" : "Welcome back"}
          </span>
          <h2>{register ? "Create your account" : "Sign in to Tablehouse"}</h2>
          <p className="auth-intro">
            {register
              ? "Join us to reserve a table and order ahead."
              : "Use your restaurant account to continue."}
          </p>
          <Alert>{error}</Alert>
          <form className="auth-form" onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  value={form.name}
                  onChange={change}
                  autoComplete="name"
                  required
                  minLength="2"
                  maxLength="120"
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={change}
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            {register && (
              <label>
                Phone <span className="optional">OPTIONAL</span>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={change}
                  autoComplete="tel"
                  maxLength="30"
                  placeholder="A number we can reach you at"
                />
              </label>
            )}
            <label>
              Password
              <span className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={change}
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength="8"
                  required
                  placeholder={
                    register ? "At least 8 characters" : "Your password"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <button className="button button-dark auth-submit" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          {!register && (
            <div className="demo-access">
              <div className="demo-heading">
                <span>DEVELOPMENT ACCESS</span>
                <span>password</span>
              </div>
              <div className="demo-buttons">
                {demos.map(([role, label, email]) => (
                  <button
                    key={role}
                    onClick={() => {
                      setForm({ ...form, email, password: "password" });
                      setError("");
                    }}
                  >
                    {label}
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to Tablehouse?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
        <div className="auth-bottom">
          <span>TABLEHOUSE · RESTAURANT OPERATIONS</span>
          <span>MADE FOR A GOOD SERVICE</span>
        </div>
      </section>
    </main>
  );
}
