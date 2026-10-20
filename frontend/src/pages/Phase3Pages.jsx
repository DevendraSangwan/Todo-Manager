import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import WorkspaceLayout from "../components/WorkspaceLayout.jsx";

const DailyReportChart = lazy(() => import("../components/DailyReportChart.jsx"));
const quadrants = [
  { id: "urgent-important", label: "Urgent + Important", hint: "Do first" },
  { id: "important-not-urgent", label: "Important, not Urgent", hint: "Schedule" },
  { id: "urgent-not-important", label: "Urgent, not Important", hint: "Delegate" },
  { id: "neither", label: "Neither", hint: "Consider later" }
];
const normalizedPriority = (value) => ({
  high: "urgent-important",
  medium: "important-not-urgent",
  low: "neither"
}[value] ?? value);

const dateValue = (value = new Date()) => {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
};

function Phase3Shell({ title, children }) {
  return (
    <WorkspaceLayout>
      <main className="phase-page">
        <p className="eyebrow">DAYMARK · PHASE 3</p>
        <h1>{title}</h1>
        {children}
      </main>
    </WorkspaceLayout>
  );
}

function requestError(error, setError) {
  setError(error.message);
}

export function CalendarPage() {
  const [month, setMonth] = useState(() => dateValue().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(dateValue());
  const [days, setDays] = useState({});
  const [todos, setTodos] = useState([]);
  const [todoPage, setTodoPage] = useState(1);
  const [dayPagination, setDayPagination] = useState({ pages: 0, total: 0 });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", priority: "important-not-urgent", dueDate: selectedDate, status: "pending"
  });
  const [error, setError] = useState("");
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const offsets = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(offsets).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  async function loadMonth() {
    try {
      const result = await api(`/todos/calendar?month=${month}`);
      setDays(result.days);
      setError("");
    } catch (loadError) {
      requestError(loadError, setError);
    }
  }

  async function loadSelectedDate() {
    try {
      const result = await api(`/todos?date=${selectedDate}&page=${todoPage}&limit=50`);
      setTodos(result.todos);
      setDayPagination(result.pagination);
      setError("");
    } catch (loadError) {
      requestError(loadError, setError);
    }
  }

  useEffect(() => { loadMonth(); }, [month]);
  useEffect(() => { loadSelectedDate(); }, [selectedDate, todoPage]);

  function selectDay(day) {
    if (!day) return;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    setSelectedDate(key);
    setTodoPage(1);
    setEditing(null);
    setForm({ title: "", description: "", priority: "important-not-urgent", dueDate: key, status: "pending" });
  }

  function beginEdit(todo) {
    setEditing(todo);
    setForm({
      title: todo.title,
      description: todo.description ?? "",
      priority: normalizedPriority(todo.priority),
      dueDate: new Date(todo.dueDate).toISOString().slice(0, 10),
      status: todo.status
    });
  }

  async function saveTodo(event) {
    event.preventDefault();
    try {
      const body = { ...form, dueDate: new Date(`${form.dueDate}T12:00:00`).toISOString() };
      if (editing) await api(`/todos/${editing._id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/todos", { method: "POST", body: JSON.stringify(body) });
      setEditing(null);
      setForm({ title: "", description: "", priority: "important-not-urgent", dueDate: selectedDate, status: "pending" });
      await Promise.all([loadSelectedDate(), loadMonth()]);
    } catch (saveError) {
      requestError(saveError, setError);
    }
  }

  return (
    <Phase3Shell title="Your calendar">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <section className="phase-card">
        <div className="calendar-heading">
          <button className="secondary-button" onClick={() => setMonth((value) => {
            const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7);
          })} type="button">Previous</button>
          <h2>{monthLabel}</h2>
          <button className="secondary-button" onClick={() => setMonth((value) => {
            const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7);
          })} type="button">Next</button>
        </div>
        <div className="calendar-grid" role="grid" aria-label={monthLabel}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong className="calendar-weekday" key={day}>{day}</strong>)}
          {cells.map((day, index) => {
            const date = day ? `${month}-${String(day).padStart(2, "0")}` : "";
            return (
              <button
                aria-label={day ? `${date}${days[date] ? `, ${days[date]} todos` : ""}` : "Empty day"}
                aria-pressed={Boolean(day && selectedDate === date)}
                className={`calendar-day${day && selectedDate === date ? " selected" : ""}${day && days[date] ? " has-todos" : ""}`}
                disabled={!day}
                key={`${date}-${index}`}
                onClick={() => selectDay(day)}
                type="button"
              >
                {day && <><span>{day}</span>{days[date] > 0 && <i aria-hidden="true" className="calendar-dot" />}</>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="phase-card">
        <h2>Todos for {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}</h2>
        {todos.map((todo) => (
          <article className="phase-row calendar-todo" key={todo._id}>
            <div><strong>{todo.title}</strong><span className="phase-subline">{todo.status} · {todo.priority}</span></div>
            <button className="text-button" onClick={() => beginEdit(todo)} type="button">Edit</button>
          </article>
        ))}
        {!todos.length && <p className="phase-empty">No todos on this date yet.</p>}
        {dayPagination.pages > 1 && <div className="pagination">
          <span>Page {dayPagination.page} of {dayPagination.pages}</span>
          <div><button disabled={todoPage <= 1} onClick={() => setTodoPage((value) => value - 1)} type="button">Previous</button>
            <button disabled={todoPage >= dayPagination.pages} onClick={() => setTodoPage((value) => value + 1)} type="button">Next</button></div>
        </div>}
        <form className="phase3-form" onSubmit={saveTodo}>
          <h3>{editing ? "Update todo" : "Add a todo for this date"}</h3>
          <input aria-label="Todo title" maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" required value={form.title} />
          <textarea aria-label="Todo notes" maxLength={2000} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Notes (optional)" value={form.description} />
          <select aria-label="Priority quadrant" onChange={(event) => setForm({ ...form, priority: event.target.value })} value={form.priority}>
            {quadrants.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <label className="phase-field">Due date<input onChange={(event) => setForm({ ...form, dueDate: event.target.value })} type="date" value={form.dueDate} /></label>
          {editing && <select aria-label="Todo status" onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}>
            <option value="pending">Pending</option><option value="completed">Completed</option>
          </select>}
          <div className="phase3-actions">
            <button className="primary-button" type="submit">{editing ? "Save changes" : "Add todo"}</button>
            {editing && <button className="secondary-button" onClick={() => { setEditing(null); setForm({ title: "", description: "", priority: "important-not-urgent", dueDate: selectedDate, status: "pending" }); }} type="button">Cancel</button>}
          </div>
        </form>
      </section>
    </Phase3Shell>
  );
}

export function PriorityMatrixPage() {
  const [todos, setTodos] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 0, total: 0 });
  const [error, setError] = useState("");
  async function load() {
    try {
      const result = await api(`/todos/matrix?page=${page}&limit=50`);
      setTodos(result.todos);
      setPagination(result.pagination);
      setError("");
    } catch (loadError) { requestError(loadError, setError); }
  }
  useEffect(() => { load(); }, [page]);

  return (
    <Phase3Shell title="Priority matrix">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="matrix-grid">
        {quadrants.map((quadrant) => (
          <section className={`phase-card matrix-quadrant quadrant-${quadrant.id}`} key={quadrant.id}>
            <div><h2>{quadrant.label}</h2><span>{quadrant.hint}</span></div>
            {todos.filter((todo) => {
              return normalizedPriority(todo.priority) === quadrant.id;
            }).map((todo) => (
              <article className="matrix-todo" key={todo._id}>
                <strong>{todo.title}</strong>
                <span>{new Date(todo.dueDate).toLocaleDateString()} · {todo.status}</span>
                {todo.description && <p>{todo.description}</p>}
              </article>
            ))}
            {!todos.some((todo) => normalizedPriority(todo.priority) === quadrant.id) &&
              <p className="phase-empty">Nothing in this quadrant.</p>}
          </section>
        ))}
      </div>
      <div className="pagination">
        <span>{pagination.total} todos · Page {pagination.page} of {pagination.pages || 1}</span>
        <div><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button>
          <button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>
      </div>
    </Phase3Shell>
  );
}

export function DailyReportPage() {
  const [date, setDate] = useState(dateValue());
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/todos/reports/daily?date=${date}`).then(setReport).catch((loadError) => requestError(loadError, setError));
  }, [date]);

  return (
    <Phase3Shell title="Daily report">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <section className="phase-card report-card">
        <label className="phase-field">Choose a date<input onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
        {report && <>
          <div className="report-stats">
            <div><span>Total</span><strong>{report.total}</strong></div>
            <div><span>Completed</span><strong>{report.completed}</strong></div>
            <div><span>Pending</span><strong>{report.pending}</strong></div>
            <div><span>Completion</span><strong>{report.completionPercentage}%</strong></div>
          </div>
          <div aria-label="Completed and pending todos chart" className="report-chart">
            <Suspense fallback={<p className="phase-empty">Loading chart…</p>}>
              <DailyReportChart data={report.chart} />
            </Suspense>
          </div>
          {!report.total && <p className="phase-empty">No todos due on this date.</p>}
        </>}
      </section>
    </Phase3Shell>
  );
}

export function TrashPage() {
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState("");
  async function load() {
    try {
      const result = await api("/todos/trash?limit=50");
      setTodos(result.todos);
      setError("");
    } catch (loadError) { requestError(loadError, setError); }
  }
  useEffect(() => { load(); }, []);
  async function restore(todo) {
    try { await api(`/todos/${todo._id}/restore`, { method: "POST" }); await load(); }
    catch (restoreError) { requestError(restoreError, setError); }
  }
  async function permanentlyDelete(todo) {
    if (!window.confirm(`Permanently delete “${todo.title}”? This cannot be undone.`)) return;
    try { await api(`/todos/${todo._id}/permanent`, { method: "DELETE" }); await load(); }
    catch (deleteError) { requestError(deleteError, setError); }
  }
  return (
    <Phase3Shell title="Trash">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <section className="phase-card">
        <p>Deleted todos stay here until you restore or permanently delete them.</p>
        {todos.map((todo) => (
          <article className="phase-row trash-row" key={todo._id}>
            <div><strong>{todo.title}</strong><span className="phase-subline">Deleted {new Date(todo.deletedAt).toLocaleString()}</span></div>
            <div className="phase3-actions"><button className="text-button" onClick={() => restore(todo)} type="button">Restore</button><button className="text-button danger-text" onClick={() => permanentlyDelete(todo)} type="button">Delete forever</button></div>
          </article>
        ))}
        {!todos.length && <p className="phase-empty">Your trash is empty.</p>}
      </section>
    </Phase3Shell>
  );
}

export function TeacherAuditPage() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/teacher-audit/mine?limit=50").then((result) => setEntries(result.entries))
      .catch((loadError) => requestError(loadError, setError));
  }, []);
  return (
    <Phase3Shell title="Teacher audit log">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <section className="phase-card">
        <p>Edits, status changes, and deletions you make to your class’s todos are recorded here.</p>
        {entries.map((entry) => (
          <article className="phase-row audit-row" key={entry._id}>
            <div><strong>{entry.action.replaceAll("_", " ")}</strong><span className="phase-subline">Todo {entry.todoId} · {new Date(entry.createdAt).toLocaleString()}</span>
              {entry.changes.map((change, index) => <span className="phase-subline" key={`${change.field}-${index}`}>{change.field}: {String(change.oldValue ?? "—")} → {String(change.newValue ?? "—")}</span>)}
            </div>
          </article>
        ))}
        {!entries.length && <p className="phase-empty">No teacher changes have been recorded yet.</p>}
      </section>
    </Phase3Shell>
  );
}
