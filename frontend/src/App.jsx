import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AIPage from "./pages/AIPage.jsx";
import { CategoriesPage, FocusPage, GoalsPage, MyDayPage } from "./pages/Phase4Pages.jsx";
import {
  CalendarPage, DailyReportPage, PriorityMatrixPage, TeacherAuditPage, TrashPage
} from "./pages/Phase3Pages.jsx";
import {
  AdminPage, ClassmatesPage, FriendsPage, NotificationsPage, OnboardingPage, TeacherPage
} from "./pages/Phase2Pages.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { SettingsPage, ClassroomPage } from "./pages/Phase6Pages.jsx";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/SecurityPages.jsx";

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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><MyDayPage /></ProtectedRoute>}
      />
      <Route path="/todos" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/ai" element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
      <Route path="/focus" element={<ProtectedRoute><FocusPage /></ProtectedRoute>} />
      <Route path="/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/matrix" element={<ProtectedRoute><PriorityMatrixPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><DailyReportPage /></ProtectedRoute>} />
      <Route path="/trash" element={<ProtectedRoute><TrashPage /></ProtectedRoute>} />
      <Route path="/teacher/audit" element={<ProtectedRoute roles={["TEACHER_ADMIN"]}><TeacherAuditPage /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute allowSetup><OnboardingPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={["SUPER_ADMIN"]}><AdminPage /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute roles={["TEACHER_ADMIN"]}><TeacherPage /></ProtectedRoute>} />
      <Route path="/classmates" element={<ProtectedRoute><ClassmatesPage /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/classroom" element={<ProtectedRoute><ClassroomPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={destination(user)} replace />} />
    </Routes>
  );
}
