import { useEffect, useState } from "react";
import {
  Archive, CalendarDays, CheckSquare2, ClipboardList, Flame, FolderKanban, GraduationCap,
  LayoutDashboard, LogOut, Menu, Moon, Network, Settings, ShieldCheck, Sparkles, Sun, Target, Users, X
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { formatUserDate } from "../lib/date.js";

const mainLinks = [
  { to: "/dashboard", label: "My Day", icon: LayoutDashboard },
  { to: "/todos", label: "All tasks", icon: CheckSquare2 },
  { to: "/focus", label: "Focus", icon: Flame }
];

const planningLinks = [
  { to: "/ai", label: "AI study space", icon: Sparkles },
  { to: "/goals", label: "Goals & habits", icon: Target },
  { to: "/categories", label: "Categories", icon: FolderKanban }
];

const plannerLinks = [
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/matrix", label: "Priority matrix", icon: Network },
  { to: "/reports", label: "Reports", icon: ClipboardList },
  { to: "/trash", label: "Trash", icon: Archive }
];

function SidebarLink({ to, label, icon: Icon, onNavigate }) {
  return (
    <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} end={["/dashboard", "/todos", "/teacher", "/admin"].includes(to)} onClick={onNavigate} to={to}>
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      <span>{label}</span>
    </NavLink>
  );
}

function NavigationGroup({ label, links, onNavigate }) {
  return (
    <div className="sidebar-group">
      <p className="sidebar-group-label">{label}</p>
      {links.map((link) => <SidebarLink key={link.to} {...link} onNavigate={onNavigate} />)}
    </div>
  );
}

export default function WorkspaceLayout({ children }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("daymark-theme") ?? "light");
  const [error, setError] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");

  useEffect(() => {
    if (user?.theme) {
      setTheme(user.theme);
      localStorage.setItem("daymark-theme", user.theme);
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.motion = user?.reducedMotion ? "reduced" : "normal";
    document.documentElement.dataset.timezone = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (user?.timezone) localStorage.setItem("daymark-timezone", user.timezone);
  }, [theme, user?.theme, user?.reducedMotion]);

  async function changeTheme() {
    const next = theme === "light" ? "dark" : "light";
    setError("");
    try {
      const { user: updatedUser } = await api("/settings", {
        method: "PATCH",
        body: JSON.stringify({ theme: next })
      });
      setUser(updatedUser);
      setTheme(next);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      localStorage.removeItem("daymark-timezone");
      setUser(null);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      const typing = target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "?") {
        setShowShortcuts(true);
        return;
      }
      if (event.key === "Escape") {
        setShowShortcuts(false);
        return;
      }
      if (event.key === "g") {
        window.sessionStorage.setItem("daymark-shortcut-prefix", "g");
        window.setTimeout(() => window.sessionStorage.removeItem("daymark-shortcut-prefix"), 1200);
        return;
      }
      if (window.sessionStorage.getItem("daymark-shortcut-prefix") === "g") {
        window.sessionStorage.removeItem("daymark-shortcut-prefix");
        const destinations = { d: "/dashboard", t: "/todos", s: "/settings" };
        if (destinations[event.key]) navigate(destinations[event.key]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    if (!user?.notificationPreferences?.browser || user.reminderMinutes < 1) return undefined;
    let active = true;
    async function checkReminders() {
      try {
        const { todos } = await api("/todos/reminders/due");
        if (!active) return;
        for (const todo of todos) {
          const key = `daymark-reminder-${todo._id}-${new Date(todo.dueDate).getTime()}`;
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "sent");
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Task due soon", { body: todo.title, tag: key });
          }
          if (user.notificationPreferences.inApp) setReminderMessage(`Reminder: “${todo.title}” is due soon.`);
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    }
    checkReminders();
    const interval = window.setInterval(checkReminders, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user?.id, user?.notificationPreferences?.browser, user?.notificationPreferences?.inApp, user?.reminderMinutes]);

  const studentLinks = [
    ...(user?.classId ? [{ to: "/classmates", label: "Classmates", icon: GraduationCap }] : []),
    ...(user?.classId ? [{ to: "/classroom", label: "Classroom", icon: ClipboardList }] : []),
    { to: "/friends", label: "Friends", icon: Users },
    { to: "/notifications", label: "Notifications", icon: ClipboardList }
  ];
  const adminLinks = [
    ...(user?.role === "SUPER_ADMIN" ? [{ to: "/admin", label: "Admin panel", icon: ShieldCheck }] : []),
    ...(user?.role === "TEACHER_ADMIN" ? [
      { to: "/classroom", label: "Classroom", icon: GraduationCap },
      { to: "/teacher", label: "Teacher panel", icon: GraduationCap },
      { to: "/teacher/audit", label: "Audit log", icon: ClipboardList }
    ] : [])
  ];

  return (
    <div className="workspace-frame">
      {mobileOpen && <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setMobileOpen(false)} type="button" />}
      <aside aria-label="Workspace navigation" className={`workspace-sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Link aria-label="Daymark home" onClick={() => setMobileOpen(false)} to="/dashboard">
            <span className="brand-mark small"><ClipboardList size={18} /></span>
            <span>daymark<span className="brand-period">.</span><small>YOUR STUDY SPACE</small></span>
          </Link>
          <button aria-label="Close navigation" className="sidebar-close" onClick={(event) => { event.preventDefault(); setMobileOpen(false); }} type="button"><X size={18} /></button>
        </div>

        <nav className="sidebar-navigation">
          <NavigationGroup label="MY WORKSPACE" links={mainLinks} onNavigate={() => setMobileOpen(false)} />
          <NavigationGroup label="GROW" links={planningLinks} onNavigate={() => setMobileOpen(false)} />
          <NavigationGroup label="PLAN" links={plannerLinks} onNavigate={() => setMobileOpen(false)} />
          {studentLinks.length > 0 && user?.role === "STUDENT" && <NavigationGroup label="PEOPLE" links={studentLinks} onNavigate={() => setMobileOpen(false)} />}
          {adminLinks.length > 0 && <NavigationGroup label="MANAGE" links={adminLinks} onNavigate={() => setMobileOpen(false)} />}
        </nav>

        <NavigationGroup label="ACCOUNT" links={[{ to: "/settings", label: "Settings", icon: Settings }]} onNavigate={() => setMobileOpen(false)} />

        <div className="sidebar-account">
          <span aria-hidden="true" className="account-avatar">{user?.email?.[0]?.toUpperCase() ?? "D"}</span>
          <span className="account-details"><strong>{user?.displayName || user?.email?.split("@")[0] || "Student"}</strong><small>{user?.role === "STUDENT" ? "Student workspace" : user?.role?.replace("_", " ")}</small></span>
          <button aria-label="Log out" className="account-logout" onClick={logout} title="Log out" type="button"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="workspace-column">
        <header className="workspace-topbar">
          <button aria-label={mobileOpen ? "Close navigation" : "Open navigation"} className="mobile-menu-button" onClick={() => setMobileOpen((open) => !open)} type="button">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="topbar-context">DAYMARK <span>/</span> YOUR WORKSPACE</span>
          <div className="workspace-topbar-actions">
            <span className="workspace-date">{formatUserDate(new Date())}</span>
            <button aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} className="icon-button" onClick={changeTheme} title="Toggle theme" type="button">
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </header>
        <div className="workspace-main">
          {error && <p className="inline-error" role="alert">{error}</p>}
          {reminderMessage && <div aria-live="polite" className="reminder-banner" role="status">{reminderMessage}<button aria-label="Dismiss reminder" onClick={() => setReminderMessage("")} type="button"><X size={15} /></button></div>}
          {children}
        </div>
      </div>
      {showShortcuts && <div className="shortcut-backdrop" onClick={() => setShowShortcuts(false)} role="presentation">
        <section aria-labelledby="shortcut-title" aria-modal="true" className="shortcut-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="Close keyboard shortcuts" className="shortcut-close" onClick={() => setShowShortcuts(false)} type="button"><X size={18} /></button>
          <h2 id="shortcut-title">Keyboard shortcuts</h2>
          <p><kbd>g</kbd> then <kbd>d</kbd> <span>Go to My Day</span></p>
          <p><kbd>g</kbd> then <kbd>t</kbd> <span>Go to tasks</span></p>
          <p><kbd>g</kbd> then <kbd>s</kbd> <span>Go to settings</span></p>
          <p><kbd>Esc</kbd> <span>Close this dialog</span></p>
        </section>
      </div>}
    </div>
  );
}
