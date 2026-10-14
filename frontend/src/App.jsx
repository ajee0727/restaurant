import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Loading } from "./components/UI";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";

function Protected() {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="app-loading">
        <Loading label="Opening the restaurant desk" />
      </div>
    );
  return user ? <Dashboard /> : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/app" replace /> : <AuthPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/app" replace /> : <AuthPage register />}
      />
      <Route path="/app/*" element={<Protected />} />
      <Route
        path="*"
        element={<Navigate to={user ? "/app" : "/login"} replace />}
      />
    </Routes>
  );
}
