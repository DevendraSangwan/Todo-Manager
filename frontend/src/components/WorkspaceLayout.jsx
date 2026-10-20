import { useEffect, useState } from "react";
import {
  Archive, CalendarDays, CheckSquare2, ClipboardList, Flame, FolderKanban, GraduationCap,
  LayoutDashboard, LogOut, Menu, Moon, Network, ShieldCheck, Sun, Target, Users, X
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const mainLinks = [
  { to: "/dashboard", label: "My Day", icon: LayoutDashboard },
  { to: "/todos", label: "All tasks", icon: CheckSquare2 },
  { to: "/focus", label: "Focus", icon: Flame }
];

const planningLinks = [
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function changeTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("daymark-theme", next);
      return next;
    });
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const studentLinks = [
    ...(user?.classId ? [{ to: "/classmates", label: "Classmates", icon: GraduationCap }] : []),
    { to: "/friends", label: "Friends", icon: Users },
    { to: "/notifications", label: "Notifications", icon: ClipboardList }
  ];
  const adminLinks = [
    ...(user?.role === "SUPER_ADMIN" ? [{ to: "/admin", label: "Admin panel", icon: ShieldCheck }] : []),
    ...(user?.role === "TEACHER_ADMIN" ? [
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

        <div className="sidebar-account">
          <span aria-hidden="true" className="account-avatar">{user?.email?.[0]?.toUpperCase() ?? "D"}</span>
          <span className="account-details"><strong>{user?.email?.split("@")[0] ?? "Student"}</strong><small>{user?.role === "STUDENT" ? "Student workspace" : user?.role?.replace("_", " ")}</small></span>
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
            <span className="workspace-date">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span>
            <button aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} className="icon-button" onClick={changeTheme} title="Toggle theme" type="button">
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </header>
        <div className="workspace-main">
          {error && <p className="inline-error" role="alert">{error}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
