import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, Circle, ClipboardList,
  History, LogOut, Moon, Plus, Search, Sun, Trash2
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const tabs = [
  { id: "add", label: "Add Todo", icon: Plus },
  { id: "all", label: "All Todos", icon: ClipboardList },
  { id: "pending", label: "Pending", icon: Circle },
  { id: "completed", label: "Completed", icon: CheckCheck }
];
const priorityOptions = [
  ["urgent-important", "Urgent + Important"],
  ["important-not-urgent", "Important, not Urgent"],
  ["urgent-not-important", "Urgent, not Important"],
  ["neither", "Neither"]
];
const priorityLabels = Object.fromEntries([
  ...priorityOptions,
  ["high", "Urgent + Important"],
  ["medium", "Important, not Urgent"],
  ["low", "Neither"]
]);

const localDateValue = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

function displayDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState("all");
  const [theme, setTheme] = useState(() => localStorage.getItem("daymark-theme") ?? "light");
  const [page, setPage] = useState(1);
  const [todos, setTodos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [filterName, setFilterName] = useState("");
  const [historyTodo, setHistoryTodo] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "important-not-urgent",
    dueDate: localDateValue(),
    visibility: "private"
  });
  const [subtaskText, setSubtaskText] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState("");
  const [completionDraft, setCompletionDraft] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("daymark-theme", theme);
  }, [theme]);

  const loadTodos = useCallback(async () => {
    setLoadError("");
    const params = new URLSearchParams({ page: String(page), limit: "8" });
    if (tab === "pending" || tab === "completed") params.set("status", tab);
    if (selectedDate) params.set("date", selectedDate);
    if (search.trim()) params.set("q", search.trim());
    if (priorityFilter) params.set("priority", priorityFilter);
    if (overdueOnly) params.set("overdue", "true");
    try {
      const result = await api(`/todos?${params}`);
      setTodos(result.todos);
      setPagination(result.pagination);
    } catch (error) {
      setLoadError(error.message);
      if (error.status === 401) {
        setUser(null);
        navigate("/login", { replace: true });
      }
    }
  }, [navigate, overdueOnly, page, priorityFilter, search, selectedDate, setUser, tab]);

  useEffect(() => {
    if (tab !== "add") loadTodos();
  }, [loadTodos, tab]);

  useEffect(() => {
    api("/todos/saved-filters").then((result) => setSavedFilters(result.filters)).catch((error) => setLoadError(error.message));
  }, []);

  const groupedTodos = useMemo(() => {
    return todos.reduce((groups, todo) => {
      const key = new Date(todo.dueDate).toLocaleDateString();
      groups[key] ??= [];
      groups[key].push(todo);
      return groups;
    }, {});
  }, [todos]);

  function chooseTab(id) {
    setTab(id);
    setPage(1);
    setCompletionDraft(null);
    setLoadError("");
  }

  async function createTodo(event) {
    event.preventDefault();
    setBusy(true);
    setLoadError("");
    try {
      const dueDate = new Date(`${form.dueDate}T12:00:00`).toISOString();
      await api("/todos", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          dueDate,
          priority: form.priority === "medium" ? "important-not-urgent" : form.priority,
          subtasks: subtaskText.split("\n").map((title) => title.trim()).filter(Boolean).map((title) => ({ title })),
          repeatFrequency: repeatFrequency || null
        })
      });
      setForm({ title: "", description: "", priority: "important-not-urgent", dueDate: localDateValue(), visibility: "private" });
      setSubtaskText("");
      setRepeatFrequency("");
      setTab("all");
      setPage(1);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateTodo(todoId, update) {
    try {
      await api(`/todos/${todoId}`, { method: "PATCH", body: JSON.stringify(update) });
      setCompletionDraft(null);
      await loadTodos();
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function deleteTodo(todoId) {
    try {
      await api(`/todos/${todoId}`, { method: "DELETE" });
      await loadTodos();
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function toggleSubtask(todo, subtaskId) {
    await updateTodo(todo._id, {
      subtasks: todo.subtasks.map((subtask) => ({
        _id: subtask._id,
        title: subtask.title,
        completed: subtask._id === subtaskId ? !subtask.completed : subtask.completed
      }))
    });
  }

  async function showHistory(todoId) {
    if (historyTodo === todoId) {
      setHistoryTodo(null);
      return;
    }
    try {
      const result = await api(`/todos/history/${todoId}`);
      setHistoryEntries(result.history);
      setHistoryTodo(todoId);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function saveCurrentFilter(event) {
    event.preventDefault();
    try {
      const { filter } = await api("/todos/saved-filters", {
        method: "POST",
        body: JSON.stringify({
          name: filterName,
          filters: {
            search,
            status: tab === "pending" || tab === "completed" ? tab : "all",
            priority: priorityFilter,
            date: selectedDate,
            overdue: overdueOnly
          }
        })
      });
      setSavedFilters((current) => [...current, filter].sort((a, b) => a.name.localeCompare(b.name)));
      setFilterName("");
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    }
  }

  function applySavedFilter(filter) {
    setSearch(filter.filters.search);
    setPriorityFilter(filter.filters.priority);
    setSelectedDate(filter.filters.date ?? "");
    setOverdueOnly(filter.filters.overdue);
    setTab(filter.filters.status === "all" ? "all" : filter.filters.status);
    setPage(1);
  }

  function applyOverdueHighPriority() {
    setTab("pending");
    setSelectedDate("");
    setPriorityFilter("urgent-important");
    setOverdueOnly(true);
    setPage(1);
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      setLoadError(error.message);
      return;
    }
    setUser(null);
    navigate("/login", { replace: true });
  }

  const pageTitle = tab === "add" ? "A fresh start" : tabs.find((item) => item.id === tab)?.label;
  const greetingName = user?.email?.split("@")[0] ?? "there";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="topbar-brand" href="/dashboard" onClick={(event) => { event.preventDefault(); chooseTab("all"); }}>
          <span className="brand-mark small"><ClipboardList size={18} /></span>
          <span>daymark<span className="brand-period">.</span></span>
        </a>
        <nav className="phase-nav dashboard-nav" aria-label="Main navigation">
          <Link to="/calendar"><CalendarDays size={14} />Calendar</Link>
          <Link to="/matrix">Matrix</Link>
          <Link to="/reports">Reports</Link>
          <Link to="/trash">Trash</Link>
          {user?.role === "SUPER_ADMIN" && <Link to="/admin">Admin panel</Link>}
          {user?.role === "TEACHER_ADMIN" && <Link to="/teacher">Teacher panel</Link>}
          {user?.role === "TEACHER_ADMIN" && <Link to="/teacher/audit">Audit log</Link>}
          {user?.classId && user.role === "STUDENT" && <Link to="/classmates">Classmates’ todos</Link>}
          {user?.role === "STUDENT" && <Link to="/friends">Friends</Link>}
          {user?.role === "STUDENT" && <Link to="/notifications">Notifications</Link>}
        </nav>
        <div className="topbar-actions">
          <button
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="icon-button theme-button"
            onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}
            title="Toggle theme"
            type="button"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <span className="user-email">{user?.email}</span>
          <button className="logout-button" onClick={logout} type="button">
            <LogOut size={16} /><span>Log out</span>
          </button>
        </div>
      </header>

      <main className="dashboard-layout">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">YOUR SPACE, YOUR PACE</p>
            <h1>Good to see you, {greetingName} <span className="wave">✳</span></h1>
            <p className="welcome-subtitle">Make a little progress. It all adds up.</p>
          </div>
          <div className="date-chip">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date())}</div>
        </section>

        <section className="workspace-card">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">YOUR TO-DOS</p>
              <h2>{pageTitle}</h2>
            </div>
            <div className="task-count">{pagination.total} {pagination.total === 1 ? "task" : "tasks"}</div>
          </div>
          <nav aria-label="Todo sections" className="tabs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                aria-current={tab === id ? "page" : undefined}
                className={`tab-button${tab === id ? " active" : ""}`}
                key={id}
                onClick={() => chooseTab(id)}
                type="button"
              >
                <Icon size={16} strokeWidth={2} />{label}
              </button>
            ))}
          </nav>

          <div className="workspace-content">
            {loadError && <p className="inline-error" role="alert">{loadError}</p>}
            {tab === "add" ? (
              <form className="todo-form" onSubmit={createTodo}>
                <div className="form-intro">
                  <span className="form-icon"><Plus size={19} /></span>
                  <div><strong>What’s on your mind?</strong><span>Put it down here, and take it one step at a time.</span></div>
                </div>
                <label htmlFor="todo-title">Title</label>
                <input
                  autoFocus
                  id="todo-title"
                  maxLength={120}
                  onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                  placeholder="e.g. Review biology notes"
                  required
                  value={form.title}
                />
                <label htmlFor="todo-description">Description <span className="optional">(optional)</span></label>
                <textarea
                  id="todo-description"
                  maxLength={2000}
                  onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                  placeholder="Add a little more detail…"
                  rows={3}
                  value={form.description}
                />
                <div className="form-grid">
                  <div>
                    <label htmlFor="todo-priority">Priority</label>
                    <select id="todo-priority" onChange={(event) => setForm((value) => ({ ...value, priority: event.target.value }))} value={form.priority}>
                      {priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="todo-date">Due date</label>
                    <input id="todo-date" onChange={(event) => setForm((value) => ({ ...value, dueDate: event.target.value }))} required type="date" value={form.dueDate} />
                  </div>
                  <div>
                    <label htmlFor="todo-visibility">Visibility</label>
                    <select id="todo-visibility" onChange={(event) => setForm((value) => ({ ...value, visibility: event.target.value }))} value={form.visibility}>
                      <option value="private">Private</option><option value="classmates">Classmates</option><option value="public">Public</option>
                    </select>
                  </div>
                </div>
                <label htmlFor="todo-subtasks">Checklist <span className="optional">(one sub-task per line)</span></label>
                <textarea id="todo-subtasks" maxLength={3900} onChange={(event) => setSubtaskText(event.target.value)} placeholder={"Read chapter 1\nTake notes"} value={subtaskText} />
                <label htmlFor="todo-repeat">Repeat</label>
                <select id="todo-repeat" onChange={(event) => setRepeatFrequency(event.target.value)} value={repeatFrequency}>
                  <option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
                <button className="primary-button form-submit" disabled={busy} type="submit">
                  <Plus size={17} />{busy ? "Adding…" : "Add todo"}
                </button>
              </form>
            ) : (
              <>
                <div className="list-controls">
                  <label className="date-filter" htmlFor="date-filter">
                    <span>Filter by date</span>
                    <input id="date-filter" onChange={(event) => { setSelectedDate(event.target.value); setPage(1); }} type="date" value={selectedDate} />
                  </label>
                  {selectedDate && <button className="clear-filter" onClick={() => { setSelectedDate(""); setPage(1); }} type="button">Clear date</button>}
                </div>
                <div className="smart-filters">
                  <label className="search-field"><Search size={16} /><input aria-label="Search todos" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search titles and notes" value={search} /></label>
                  <select aria-label="Filter by priority" onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }} value={priorityFilter}>
                    <option value="">All priorities</option>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <label className="overdue-filter"><input checked={overdueOnly} onChange={(event) => { setOverdueOnly(event.target.checked); setPage(1); }} type="checkbox" /> Overdue</label>
                  <button className="secondary-button compact-button" onClick={applyOverdueHighPriority} type="button">Overdue high-priority</button>
                  <select aria-label="Saved filters" defaultValue="" onChange={(event) => {
                    const filter = savedFilters.find((item) => item._id === event.target.value);
                    if (filter) applySavedFilter(filter);
                  }}>
                    <option value="">Saved filters</option>{savedFilters.map((filter) => <option key={filter._id} value={filter._id}>{filter.name}</option>)}
                  </select>
                  <form className="save-filter-form" onSubmit={saveCurrentFilter}>
                    <input aria-label="Saved filter name" maxLength={60} onChange={(event) => setFilterName(event.target.value)} placeholder="Name this filter" required value={filterName} />
                    <button className="text-button" type="submit">Save filter</button>
                  </form>
                </div>
                {todos.length ? (
                  <div className="todo-groups">
                    {Object.entries(groupedTodos).map(([date, dateTodos]) => (
                      <section className="todo-group" key={date}>
                        <h3><span className="group-date-dot" />{displayDate(dateTodos[0].dueDate)}</h3>
                        <div className="todo-list">
                          {dateTodos.map((todo) => (
                            <article className={`todo-item${todo.status === "completed" ? " is-completed" : ""}`} key={todo._id}>
                              <button
                                aria-label={todo.status === "completed" ? `Mark ${todo.title} pending` : `Mark ${todo.title} complete`}
                                className={`todo-check${todo.status === "completed" ? " checked" : ""}`}
                                onClick={() => todo.status === "completed"
                                  ? updateTodo(todo._id, { status: "pending" })
                                  : setCompletionDraft(todo._id)}
                                type="button"
                              >
                                {todo.status === "completed" ? <Check size={15} /> : null}
                              </button>
                              <div className="todo-main">
                                <div className="todo-title-row">
                                  <h4>{todo.title}</h4>
                                  <span className={`priority-badge priority-${todo.priority}`}>{priorityLabels[todo.priority] ?? todo.priority}</span>
                                </div>
                                {todo.description && <p className="todo-description">{todo.description}</p>}
                                {todo.repeatFrequency && <p className="todo-description">Repeats {todo.repeatFrequency}</p>}
                                {todo.subtasks?.length > 0 && <ul className="subtask-list">{todo.subtasks.map((subtask) => (
                                  <li key={subtask._id}>
                                    <label><input checked={subtask.completed} onChange={() => toggleSubtask(todo, subtask._id)} type="checkbox" /> <span className={subtask.completed ? "subtask-complete" : ""}>{subtask.title}</span></label>
                                  </li>
                                ))}</ul>}
                                {todo.completionNote && <p className="completion-note">Note: {todo.completionNote}</p>}
                                <button className="text-button history-button" onClick={() => showHistory(todo._id)} type="button"><History size={13} />{historyTodo === todo._id ? "Hide history" : "History"}</button>
                                {historyTodo === todo._id && <div className="history-list">
                                  {historyEntries.map((entry) => <div key={entry._id}><strong>{entry.action}</strong> · {new Date(entry.createdAt).toLocaleString()}
                                    {entry.changes.map((change, index) => <span key={`${change.field}-${index}`}>{change.field}: {String(change.oldValue ?? "—")} → {String(change.newValue ?? "—")}</span>)}
                                  </div>)}
                                </div>}
                                {completionDraft === todo._id && (
                                  <form className="completion-form" onSubmit={(event) => {
                                    event.preventDefault();
                                    const note = new FormData(event.currentTarget).get("completionNote");
                                    updateTodo(todo._id, { status: "completed", completionNote: note });
                                  }}>
                                    <input aria-label="Optional completion note" maxLength={1000} name="completionNote" placeholder="Add an optional note…" />
                                    <button className="mini-submit" type="submit">Save</button>
                                    <button className="mini-cancel" onClick={() => setCompletionDraft(null)} type="button">Cancel</button>
                                  </form>
                                )}
                              </div>
                              <button aria-label={`Move ${todo.title} to trash`} className="delete-button" onClick={() => deleteTodo(todo._id)} type="button">
                                <Trash2 size={16} />
                              </button>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><ClipboardList size={23} /></div>
                    <h3>{selectedDate ? "Nothing planned for this day" : "A little breathing room"}</h3>
                    <p>{selectedDate ? "Try another date, or clear the filter to see all your todos." : "No todos here just yet. Add one when you’re ready."}</p>
                    {!selectedDate && <button className="text-button" onClick={() => chooseTab("add")} type="button"><Plus size={16} /> Add a todo</button>}
                  </div>
                )}
                <div className="pagination">
                  <span>{pagination.total ? `Page ${pagination.page} of ${pagination.pages}` : "No tasks to show"}</span>
                  <div>
                    <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button"><ArrowLeft size={16} />Previous</button>
                    <button aria-label="Next page" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} type="button">Next<ArrowRight size={16} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        <footer className="dashboard-footer"><span>Made for your next small win.</span><ArrowDown size={14} /></footer>
      </main>
    </div>
  );
}
