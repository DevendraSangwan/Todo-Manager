import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import {
  AdminPage, ClassmatesPage, FriendsPage, NotificationsPage, OnboardingPage, TeacherPage
} from "./pages/Phase2Pages.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function ProtectedRoute({ children, roles, allowSetup = false }) {
  const { user, checking } = useAuth();
  if (checking) {
    return <main className="loading-screen">Loading your workspace…</main>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowSetup && !user.setupComplete && user.role === "STUDENT") return <Navigate to="/onboarding" replace />;
  if (allowSetup && user.setupComplete) return <Navigate to={destination(user)} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={destination(user)} replace />;
  return children;
}

function destination(user) {
  if (user?.role === "SUPER_ADMIN") return "/admin";
  if (user?.role === "TEACHER_ADMIN") return "/teacher";
  if (!user?.setupComplete && user?.role === "STUDENT") return "/onboarding";
  return "/dashboard";
}

export default function App() {
  const { user, checking } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!checking && user ? <Navigate to={destination(user)} replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/register"
        element={!checking && user ? <Navigate to={destination(user)} replace /> : <AuthPage mode="register" />}
      />
      <Route
        path="/dashboard"
        element={<ProtectedRoute roles={["STUDENT"]}><Dashboard /></ProtectedRoute>}
      />
      <Route path="/onboarding" element={<ProtectedRoute allowSetup><OnboardingPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={["SUPER_ADMIN"]}><AdminPage /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute roles={["TEACHER_ADMIN"]}><TeacherPage /></ProtectedRoute>} />
      <Route path="/classmates" element={<ProtectedRoute><ClassmatesPage /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={destination(user)} replace />} />
    </Routes>
  );
}
