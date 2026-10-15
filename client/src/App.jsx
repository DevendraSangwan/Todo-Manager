import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function ProtectedRoute({ children }) {
  const { user, checking } = useAuth();
  if (checking) {
    return <main className="loading-screen">Loading your workspace…</main>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, checking } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!checking && user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/register"
        element={!checking && user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" />}
      />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
