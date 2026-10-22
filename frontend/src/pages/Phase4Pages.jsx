import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { formatUserDate } from "../lib/date.js";
import WorkspaceLayout from "../components/WorkspaceLayout.jsx";
import AISuggestionsCard from "../components/AISuggestionsCard.jsx";

function Phase4Shell({ title, children }) {
  return (
    <WorkspaceLayout>
      <main className="phase-page">
        <p className="eyebrow">DAYMARK · PRODUCTIVITY</p>
        <h1>{title}</h1>
        {children}
      </main>
    </WorkspaceLayout>
  );
}

function ErrorMessage({ children }) {
  return children ? <p className="inline-error" role="alert">{children}</p> : null;
}

const priorityRank = { "urgent-important": 0, high: 0, "important-not-urgent": 1, medium: 1, "urgent-not-important": 2, neither: 3, low: 3 };
const priorityLabel = {
  "urgent-important": "Urgent + Important",
  "important-not-urgent": "Important, not Urgent",
  "urgent-not-important": "Urgent, not Important",
  neither: "Neither",
  high: "Urgent + Important",
  medium: "Important, not Urgent",
  low: "Neither"
};

function taskLocked(todo) {
  return todo.dependencies?.some((dependency) => dependency.status !== "completed") ?? false;
}

function TaskCard({ todo, onToggle }) {
  const locked = taskLocked(todo);
  return (
    <article className={`phase-row productivity-task${locked ? " is-locked" : ""}`}>
      <div>
        <strong>{todo.title}</strong>
        <span>{priorityLabel[todo.priority] ?? todo.priority} · {todo.categoryId?.name ?? "Uncategorized"}</span>
        {locked && <span>Locked until {todo.dependencies.filter((dependency) => dependency.status !== "completed").map(({ title }) => title).join(", ")} is complete</span>}
      </div>
      <button className="secondary-button" disabled={locked} onClick={() => onToggle(todo)} type="button">
        {todo.status === "completed" ? "Undo" : locked ? "Locked" : "Complete"}
      </button>
    </article>
  );
}

export function MyDayPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/productivity/my-day"));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(todo) {
    setBusy(true);
    try {
      await api(`/todos/${todo._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: todo.status === "completed" ? "pending" : "completed" })
      });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Phase4Shell title="My Day">
      <section className="phase-card myday-summary">
        <div>
          <p className="eyebrow">TODAY'S PROGRESS</p>
          <h2>{data?.progress ?? 0}% complete <span className="muted-copy">· {data?.completed ?? 0} of {data?.total ?? 0} tasks</span></h2>
          <p className="muted-copy">Daily goal: {data?.dailyGoalHours ?? 2} hours</p>
          <div className="progress-track"><span style={{ width: `${data?.progress ?? 0}%` }} /></div>
        </div>
        <div className="myday-stats">
          <div><strong>{data?.currentStreak ?? 0} Days Streak</strong><span>Best: {data?.bestStreak ?? 0} days</span></div>
          <div>
            <strong>{data?.xp ?? 0} XP</strong>
            <span>Level {Math.floor((data?.xp ?? 0) / 100) + 1} · {(data?.xp ?? 0) % 100}/100 to next level</span>
            <div aria-label={`${(data?.xp ?? 0) % 100} percent progress to next XP level`} className="progress-track xp-progress">
              <span style={{ width: `${(data?.xp ?? 0) % 100}%` }} />
            </div>
          </div>
        </div>
      </section>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <AISuggestionsCard onApplied={load} />
      <div className="myday-grid">
        <section className="phase-card">
          <h2>Today's tasks</h2>
          {data?.todayTodos.map((todo) => <TaskCard key={todo._id} onToggle={toggle} todo={todo} />)}
          {!data?.todayTodos.length && <p className="phase-empty">Nothing scheduled for today. Enjoy the breathing room.</p>}
          {busy && <p className="muted-copy">Saving your progress…</p>}
          <Link className="text-button" to="/todos">Manage all todos</Link>
        </section>
        <section className="phase-card">
          <h2>Top 3 priorities</h2>
          {data?.topPriorities.map((todo, index) => (
            <div className="phase-row" key={todo._id}><span className="count-pill">{index + 1}</span><strong>{todo.title}</strong><span>{priorityLabel[todo.priority] ?? todo.priority}</span></div>
          ))}
          {!data?.topPriorities.length && <p className="phase-empty">Add a task to set today's priorities.</p>}
          <h2 className="section-heading-spaced">Overdue</h2>
          {data?.overdueTodos.map((todo) => <TaskCard key={todo._id} onToggle={toggle} todo={todo} />)}
          {!data?.overdueTodos.length && <p className="phase-empty">No overdue tasks. Nice work.</p>}
        </section>
        <section className="phase-card">
          <h2>Daily habits</h2>
          {data?.habits.map((habit) => (
            <label className="phase-row habit-row" key={habit._id}>
              <input
                checked={habit.completedToday}
                onChange={async (event) => {
                  try {
                    await api(`/productivity/habits/${habit._id}/today`, { method: "PATCH", body: JSON.stringify({ completed: event.target.checked }) });
                    await load();
                  } catch (requestError) { setError(requestError.message); }
                }}
                type="checkbox"
              />
              <strong>{habit.name}</strong>
            </label>
          ))}
          {!data?.habits.length && <p className="phase-empty">Build a daily routine on the <Link to="/goals">Goals & habits</Link> page.</p>}
        </section>
        <section className="phase-card">
          <h2>Category progress</h2>
          {data?.categories.map((category) => {
            const progress = category.total ? Math.round(category.completed / category.total * 100) : 0;
            return <div className="category-progress" key={category._id}>
              <div><strong>{category.name}</strong><span>{category.completed}/{category.total} · {progress}%</span></div>
              <div className="progress-track"><span style={{ width: `${progress}%`, background: category.color }} /></div>
            </div>;
          })}
          {!data?.categories.length && <p className="phase-empty">Add categories to see progress by area.</p>}
        </section>
      </div>
    </Phase4Shell>
  );
}

const defaultSettings = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };

export function FocusPage() {
  const { user, setUser } = useAuth();
  const [todos, setTodos] = useState([]);
  const [todoId, setTodoId] = useState("");
  const [settings, setSettings] = useState(user?.focusSettings ?? defaultSettings);
  const [timerType, setTimerType] = useState("focus");
  const [seconds, setSeconds] = useState((user?.focusSettings?.focusMinutes ?? 25) * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [logMinutes, setLogMinutes] = useState(user?.focusSettings?.focusMinutes ?? 25);
  const [focusCount, setFocusCount] = useState(0);
  const [optIn, setOptIn] = useState(user?.leaderboardOptIn ?? false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");

  const availableTodos = useMemo(() => todos.filter((todo) => !taskLocked(todo)), [todos]);
  const duration = timerType === "focus" ? settings.focusMinutes
    : timerType === "short-break" ? settings.shortBreakMinutes : settings.longBreakMinutes;
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const loadTodos = useCallback(async () => {
    try {
      const { todos: activeTodos } = await api("/todos?status=pending&limit=50");
      const eligible = activeTodos.filter((todo) => !taskLocked(todo));
      setTodos(activeTodos);
      setTodoId((current) => eligible.some((todo) => todo._id === current) ? current : eligible[0]?._id ?? "");
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { loadTodos(); }, [loadTodos]);

  useEffect(() => {
    if (!running) return undefined;
    const timeout = window.setTimeout(() => {
      if (seconds <= 1) {
        setSeconds(0);
        setRunning(false);
        setFinished(true);
        setLogMinutes(duration);
        if (timerType === "focus") setFocusCount((count) => count + 1);
        if (timerType === "long-break") setFocusCount(0);
      } else {
        setSeconds((current) => current - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [duration, running, seconds, timerType]);

  useEffect(() => {
    if (!running && !finished) setSeconds(duration * 60);
  }, [duration]);

  function chooseType(type) {
    if (running) return;
    setTimerType(type);
    const nextDuration = type === "focus" ? settings.focusMinutes
      : type === "short-break" ? settings.shortBreakMinutes : settings.longBreakMinutes;
    setSeconds(nextDuration * 60);
    setFinished(false);
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      const parsed = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, Number(value)]));
      const { user: updated } = await api("/productivity/profile", { method: "PATCH", body: JSON.stringify({ focusSettings: parsed }) });
      setSettings(updated.focusSettings);
      setUser((current) => ({ ...current, focusSettings: updated.focusSettings }));
      if (!running) setSeconds(durationFor(timerType, updated.focusSettings) * 60);
      setNotice("Focus preferences saved.");
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }

  async function logSession(minutes, type = timerType) {
    if (!todoId) {
      setError("Choose a todo before logging time.");
      return;
    }
    setBusy(true);
    try {
      await api("/productivity/focus-sessions", {
        method: "POST",
        body: JSON.stringify({ todoId, type, minutes: Number(minutes) })
      });
      setFinished(false);
      setManualMinutes("");
      setNotice(type === "focus" ? `${minutes} minutes added to this todo's actual time.` : "Break session logged.");
      setError("");
      await loadTodos();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function toggleLeaderboard(event) {
    const next = event.target.checked;
    try {
      await api("/productivity/profile", { method: "PATCH", body: JSON.stringify({ leaderboardOptIn: next }) });
      setOptIn(next);
      setUser((current) => ({ ...current, leaderboardOptIn: next }));
      setLeaderboard([]);
      if (next) {
        const result = await api("/productivity/leaderboard");
        setLeaderboard(result.leaderboard);
      }
      setError("");
    } catch (requestError) {
      setOptIn(!next);
      setError(requestError.message);
    }
  }

  async function loadLeaderboard() {
    try {
      const result = await api("/productivity/leaderboard");
      setLeaderboard(result.leaderboard);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <Phase4Shell title="Focus mode">
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <p className="success-copy">{notice}</p>}
      <section className="phase-card focus-card">
        <p>Choose a todo, set a session, then press Start when you're ready. The timer never starts automatically.</p>
        <label className="phase-field">Focus on
          <select disabled={running} onChange={(event) => setTodoId(event.target.value)} value={todoId}>
            <option value="">Select a todo…</option>
            {availableTodos.map((todo) => <option key={todo._id} value={todo._id}>{todo.title}</option>)}
          </select>
        </label>
        <div aria-label="Timer type" className="friend-buttons">
          <button className={timerType === "focus" ? "selected" : ""} disabled={running} onClick={() => chooseType("focus")} type="button">Focus · {settings.focusMinutes} min</button>
          <button className={timerType === "short-break" ? "selected" : ""} disabled={running} onClick={() => chooseType("short-break")} type="button">Short break · {settings.shortBreakMinutes} min</button>
          <button className={timerType === "long-break" ? "selected" : ""} disabled={running} onClick={() => chooseType("long-break")} type="button">Long break · {settings.longBreakMinutes} min</button>
        </div>
        {focusCount > 0 && focusCount % Number(settings.longBreakInterval) === 0 && timerType !== "long-break" &&
          <p className="success-copy">You've completed {focusCount} focus sessions. A long break is recommended.</p>}
        <div aria-live="polite" className="focus-clock">{clock}</div>
        <div className="phase3-actions focus-actions">
          {!running
            ? <button className="primary-button" disabled={!todoId || finished} onClick={() => { setFinished(false); setRunning(true); }} type="button">Start</button>
            : <button className="secondary-button" onClick={() => setRunning(false)} type="button">Pause</button>}
          {!running && <button className="secondary-button" onClick={() => { setSeconds(duration * 60); setFinished(false); }} type="button">Reset</button>}
          <span className="muted-copy">Focus sessions completed: {focusCount}</span>
        </div>
        {finished && <form className="phase-form time-log-form" onSubmit={(event) => { event.preventDefault(); logSession(logMinutes); }}>
          <label>Actual minutes spent
            <input max="600" min="1" onChange={(event) => setLogMinutes(event.target.value)} required type="number" value={logMinutes} />
          </label>
          <button className="primary-button" disabled={busy} type="submit">Log session</button>
          <button className="secondary-button" onClick={() => setFinished(false)} type="button">Skip logging</button>
        </form>}
        <form className="phase4-settings" onSubmit={saveSettings}>
          <h2>Customize durations</h2>
          {[
            ["focusMinutes", "Focus (minutes)", 1, 180],
            ["shortBreakMinutes", "Short break (minutes)", 1, 60],
            ["longBreakMinutes", "Long break (minutes)", 1, 120],
            ["longBreakInterval", "Focus sessions per long break", 2, 8]
          ].map(([key, label, min, max]) => (
            <label key={key}>{label}
              <input disabled={running} max={max} min={min} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} required type="number" value={settings[key]} />
            </label>
          ))}
          <button className="secondary-button" disabled={running} type="submit">Save durations</button>
        </form>
        <form className="phase-form time-log-form" onSubmit={(event) => { event.preventDefault(); logSession(manualMinutes, "focus"); }}>
          <label>Log time spent manually (minutes)
            <input disabled={running || finished} max="600" min="1" onChange={(event) => setManualMinutes(event.target.value)} required type="number" value={manualMinutes} />
          </label>
          <button className="secondary-button" disabled={busy || running || finished || !todoId || !manualMinutes} type="submit">Add actual time</button>
        </form>
      </section>
      {user?.role === "STUDENT" && user?.classId && <section className="phase-card">
        <h2>Class leaderboard <span className="optional">· XP only, never your todos</span></h2>
        <label className="leaderboard-opt-in"><input checked={optIn} onChange={toggleLeaderboard} type="checkbox" /> Opt in to share my name and XP with classmates</label>
        {optIn && <button className="secondary-button compact-button" onClick={loadLeaderboard} type="button">Refresh leaderboard</button>}
        {optIn && leaderboard.map((entry) => <div className={`phase-row${entry.isYou ? " leaderboard-you" : ""}`} key={`${entry.rank}-${entry.name}`}><span>#{entry.rank}</span><strong>{entry.name}{entry.isYou ? " (you)" : ""}</strong><span>{entry.xp} XP · {entry.currentStreak} day streak</span></div>)}
        {optIn && !leaderboard.length && <p className="phase-empty">No classmates have opted in yet.</p>}
      </section>}
    </Phase4Shell>
  );
}

function durationFor(type, settings) {
  return type === "focus" ? settings.focusMinutes : type === "short-break" ? settings.shortBreakMinutes : settings.longBreakMinutes;
}

export function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [goalForm, setGoalForm] = useState({ title: "", description: "", targetDate: "", milestones: "" });
  const [habitName, setHabitName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [goalResult, habitResult] = await Promise.all([api("/productivity/goals"), api("/productivity/habits")]);
      setGoals(goalResult.goals);
      setHabits(habitResult.habits);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createGoal(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/productivity/goals", {
        method: "POST",
        body: JSON.stringify({
          ...goalForm,
          targetDate: goalForm.targetDate || undefined,
          milestones: goalForm.milestones.split("\n").map((line) => line.trim()).filter(Boolean)
        })
      });
      setGoalForm({ title: "", description: "", targetDate: "", milestones: "" });
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createHabit(event) {
    event.preventDefault();
    try {
      await api("/productivity/habits", { method: "POST", body: JSON.stringify({ name: habitName }) });
      setHabitName("");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <Phase4Shell title="Goals & habits">
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Create a goal</h2>
        <form className="phase4-form" onSubmit={createGoal}>
          <label>Goal<input maxLength={120} onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })} required value={goalForm.title} /></label>
          <label>Description<input maxLength={1000} onChange={(event) => setGoalForm({ ...goalForm, description: event.target.value })} value={goalForm.description} /></label>
          <label>Target date<input onChange={(event) => setGoalForm({ ...goalForm, targetDate: event.target.value })} type="date" value={goalForm.targetDate} /></label>
          <label>Milestones <span className="optional">(one per line)</span><textarea maxLength={4000} onChange={(event) => setGoalForm({ ...goalForm, milestones: event.target.value })} rows={3} value={goalForm.milestones} /></label>
          <button className="primary-button" disabled={busy} type="submit">Create goal</button>
        </form>
      </section>
      <section className="phase-card">
        <h2>Your goals</h2>
        {goals.map((goal) => {
          const done = goal.milestones.filter((milestone) => milestone.completed).length;
          const progress = goal.milestones.length ? Math.round(done / goal.milestones.length * 100) : 0;
          return <article className="goal-item" key={goal._id}>
            <div className="goal-heading"><div><h3>{goal.title}</h3><p>{goal.description || "Keep making small steps."}</p></div><button className="text-button danger-text" onClick={async () => {
              try { await api(`/productivity/goals/${goal._id}`, { method: "DELETE" }); await load(); }
              catch (requestError) { setError(requestError.message); }
            }} type="button">Delete</button></div>
            {goal.targetDate && <p className="muted-copy">Target: {formatUserDate(goal.targetDate)}</p>}
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <p className="muted-copy">{done} of {goal.milestones.length} milestones · {progress}%</p>
            {goal.milestones.map((milestone, index) => <label className="phase-row habit-row" key={`${goal._id}-${index}`}>
              <input checked={milestone.completed} onChange={async (event) => {
                try {
                  await api(`/productivity/goals/${goal._id}/milestones/${index}`, {
                    method: "PATCH", body: JSON.stringify({ completed: event.target.checked })
                  });
                  await load();
                } catch (requestError) { setError(requestError.message); }
              }} type="checkbox" />
              <span className={milestone.completed ? "subtask-complete" : ""}>
                {milestone.title}
                {milestone.targetDate && <small className="milestone-target"> · due {formatUserDate(milestone.targetDate)}</small>}
              </span>
            </label>)}
            {!goal.milestones.length && <p className="phase-empty">Add milestones when you are ready to break this goal into steps.</p>}
          </article>;
        })}
        {!goals.length && <p className="phase-empty">No goals yet. Add one above to get started.</p>}
      </section>
      <section className="phase-card">
        <h2>Daily habits</h2>
        <form className="phase-form" onSubmit={createHabit}>
          <input aria-label="New habit" maxLength={80} onChange={(event) => setHabitName(event.target.value)} placeholder="e.g. Read for 20 minutes" required value={habitName} />
          <button className="primary-button" type="submit">Add habit</button>
        </form>
        {habits.map((habit) => <div className="phase-row" key={habit._id}>
          <strong>{habit.name}</strong>
          <span>{habit.completedDates.length} days tracked</span>
          <button className="text-button danger-text" onClick={async () => {
            try { await api(`/productivity/habits/${habit._id}`, { method: "DELETE" }); await load(); }
            catch (requestError) { setError(requestError.message); }
          }} type="button">Delete</button>
        </div>)}
        {!habits.length && <p className="phase-empty">Add habits to check in on them from My Day.</p>}
      </section>
    </Phase4Shell>
  );
}

export function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7465d7");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api("/productivity/categories");
      setCategories(result.categories);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createCategory(event) {
    event.preventDefault();
    try {
      await api("/productivity/categories", { method: "POST", body: JSON.stringify({ name, color }) });
      setName("");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <Phase4Shell title="Categories">
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Make your own categories</h2>
        <p>Use categories like Study, Coding, or Health to see where your tasks are moving forward.</p>
        <form className="phase4-form category-form" onSubmit={createCategory}>
          <label>Category name<input maxLength={40} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label>Color<input aria-label="Category color" onChange={(event) => setColor(event.target.value)} type="color" value={color} /></label>
          <button className="primary-button" type="submit">Add category</button>
        </form>
      </section>
      <section className="phase-card">
        <h2>Progress by category</h2>
        {categories.map((category) => {
          const progress = category.total ? Math.round(category.completed / category.total * 100) : 0;
          return <div className="category-progress category-row" key={category._id}>
            <div><strong><span className="category-dot" style={{ background: category.color }} />{category.name}</strong><span>{category.completed}/{category.total} tasks · {progress}%</span></div>
            <div className="progress-track"><span style={{ width: `${progress}%`, background: category.color }} /></div>
            <button className="text-button danger-text" onClick={async () => {
              try { await api(`/productivity/categories/${category._id}`, { method: "DELETE" }); await load(); }
              catch (requestError) { setError(requestError.message); }
            }} type="button">Delete</button>
          </div>;
        })}
        {!categories.length && <p className="phase-empty">No categories yet. Create one above.</p>}
        <p className="muted-copy"><Link to="/todos">Assign categories while creating todos.</Link></p>
      </section>
    </Phase4Shell>
  );
}
