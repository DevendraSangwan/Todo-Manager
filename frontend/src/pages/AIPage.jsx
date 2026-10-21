import { useEffect, useState } from "react";
import {
  Brain, CalendarClock, Check, Clock3, Lightbulb, ListChecks, MessageSquareText,
  Mic, RefreshCw, Send, Sparkles, Target, Undo2
} from "lucide-react";
import WorkspaceLayout from "../components/WorkspaceLayout.jsx";
import { api } from "../lib/api.js";

const sections = [
  ["suggestions", "Today's ideas", Lightbulb],
  ["steps", "Break into steps", ListChecks],
  ["chat", "Chat with tasks", MessageSquareText],
  ["goals", "Goal to action", Target],
  ["voice", "Voice to todo", Mic],
  ["report", "Weekly report", CalendarClock],
  ["settings", "AI permissions", Brain]
];
const priorities = {
  "urgent-important": "Urgent + Important",
  "important-not-urgent": "Important, not Urgent",
  "urgent-not-important": "Urgent, not Important",
  neither: "Neither"
};
const localDate = (date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
};
const localDateTime = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
}).format(new Date(value));

function Panel({ children, title, icon: Icon, description }) {
  return (
    <section className="phase-card ai-panel">
      <div className="ai-panel-heading">
        <span className="ai-icon"><Icon size={18} /></span>
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function TodoContextList({ todos, onBreak, onReschedule }) {
  return (
    <div className="ai-task-list">
      {todos.map((todo) => (
        <article className="ai-task" key={todo._id}>
          <div>
            <strong>{todo.title}</strong>
            <span>{todo.status} · due {localDateTime(todo.dueDate)} · estimate {todo.estimatedMinutes ?? 0}m / actual {todo.actualMinutes ?? 0}m</span>
          </div>
          <div className="ai-inline-actions">
            <button className="secondary-button compact-button" onClick={() => onBreak(todo)} type="button">Break into steps</button>
            {todo.status === "pending" && <button className="secondary-button compact-button" onClick={() => onReschedule(todo)} type="button">Reschedule help</button>}
          </div>
        </article>
      ))}
      {!todos.length && <p className="phase-empty">Add a todo first to use your personal task context here.</p>}
    </div>
  );
}

export default function AIPage() {
  const [active, setActive] = useState("suggestions");
  const [todos, setTodos] = useState([]);
  const [settings, setSettings] = useState({ configured: false, alwaysAllowActions: [], allowedActions: [] });
  const [suggestions, setSuggestions] = useState(null);
  const [stepsDraft, setStepsDraft] = useState(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatAnswer, setChatAnswer] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const [goal, setGoal] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [goalPlan, setGoalPlan] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [report, setReport] = useState(null);
  const [actionPreview, setActionPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/todos?limit=50"), api("/ai/settings")])
      .then(([todoData, aiSettings]) => {
        setTodos(todoData.todos);
        setSettings(aiSettings);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  async function perform(key, callback) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await callback();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function makeSuggestions() {
    await perform("suggestions", async () => setSuggestions(await api("/ai/suggestions", { method: "POST", body: "{}" })));
  }

  async function breakIntoSteps(todo) {
    await perform(`steps-${todo._id}`, async () => {
      const result = await api(`/ai/break-into-steps/${todo._id}`, { method: "POST", body: "{}" });
      setStepsDraft({ todo, steps: result.steps });
    });
  }

  async function saveSteps() {
    if (!stepsDraft) return;
    await perform("save-steps", async () => {
      await api(`/todos/${stepsDraft.todo._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          subtasks: [
            ...(stepsDraft.todo.subtasks ?? []).map(({ _id, title, completed }) => ({ _id, title, completed })),
            ...stepsDraft.steps.map((title) => ({ title, completed: false }))
          ]
        })
      });
      setStepsDraft(null);
      setNotice("Your reviewed checklist was saved to the todo.");
      setTodos((current) => current.map((todo) => todo._id === stepsDraft.todo._id
        ? { ...todo, subtasks: [...(todo.subtasks ?? []), ...stepsDraft.steps.map((title) => ({ title, completed: false }))] }
        : todo));
    });
  }

  async function askQuestion(event) {
    event.preventDefault();
    await perform("chat", async () => {
      setChatAnswer(await api("/ai/chat", { method: "POST", body: JSON.stringify({ message: chatMessage }) }));
    });
  }

  async function getRescheduling(todo) {
    await perform(`reschedule-${todo._id}`, async () => {
      const result = await api(`/ai/reschedule/${todo._id}`, { method: "POST", body: "{}" });
      setReschedule({ todo, ...result });
    });
  }

  async function previewAction(action) {
    await perform("preview", async () => {
      const result = await api("/ai/actions/preview", { method: "POST", body: JSON.stringify(action) });
      setActionPreview({
        id: result.action._id,
        ...action,
        previousValues: result.action.previousValues,
        automaticallyApplied: result.automaticallyApplied
      });
      if (result.automaticallyApplied) {
        setNotice("This action matched your always-allow setting. Review the change below; you can undo it.");
        await refreshTodos();
      }
    });
  }

  async function approveAction() {
    if (!actionPreview) return;
    await perform("approve", async () => {
      await api(`/ai/actions/${actionPreview.id}/approve`, { method: "POST", body: "{}" });
      setActionPreview((current) => ({ ...current, automaticallyApplied: true }));
      setNotice("Approved. The change is now applied; you can undo it here.");
      await refreshTodos();
    });
  }

  async function undoAction() {
    if (!actionPreview) return;
    await perform("undo", async () => {
      await api(`/ai/actions/${actionPreview.id}/undo`, { method: "POST", body: "{}" });
      setActionPreview(null);
      setNotice("The AI action was undone.");
      await refreshTodos();
    });
  }

  async function refreshTodos() {
    const result = await api("/todos?limit=50");
    setTodos(result.todos);
  }

  async function generateGoalPlan(event) {
    event.preventDefault();
    await perform("goal", async () => {
      setGoalPlan(await api("/ai/goal-plan", {
        method: "POST",
        body: JSON.stringify({ goal, ...(goalTargetDate ? { targetDate: goalTargetDate } : {}) })
      }));
    });
  }

  async function saveGoalPlan() {
    if (!goalPlan) return;
    await perform("save-goal", async () => {
      await api("/ai/goal-plan/apply", { method: "POST", body: JSON.stringify(goalPlan) });
      setGoalPlan(null);
      setGoal("");
      setNotice("Your goal, milestones, and private todos have been saved.");
      await refreshTodos();
    });
  }

  async function startVoiceCapture() {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. You can still type a transcript below.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => setTranscript(event.results[0][0].transcript);
    recognition.onerror = (event) => setError(`Speech recognition failed: ${event.error}. You can enter the transcript manually.`);
    recognition.start();
  }

  async function parseTranscript(event) {
    event.preventDefault();
    await perform("voice", async () => {
      setVoiceDraft(await api("/ai/parse-voice", {
        method: "POST",
        body: JSON.stringify({
          transcript,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      }));
    });
  }

  async function saveVoiceTodo() {
    if (!voiceDraft) return;
    await perform("save-voice", async () => {
      const dueDate = new Date(`${voiceDraft.dueDate}T${voiceDraft.dueTime}:00`);
      await api("/todos", {
        method: "POST",
        body: JSON.stringify({
          title: voiceDraft.title,
          dueDate: dueDate.toISOString(),
          priority: voiceDraft.priority,
          estimatedMinutes: voiceDraft.estimatedMinutes,
          visibility: "private"
        })
      });
      setVoiceDraft(null);
      setTranscript("");
      setNotice("Your reviewed voice todo was created privately.");
      await refreshTodos();
    });
  }

  async function loadWeeklyReport() {
    await perform("report", async () => setReport(await api("/ai/weekly-report")));
  }

  async function savePermissions(event) {
    const action = event.target.value;
    const enabled = event.target.checked;
    const next = enabled
      ? [...new Set([...settings.alwaysAllowActions, action])]
      : settings.alwaysAllowActions.filter((item) => item !== action);
    await perform("settings", async () => {
      const result = await api("/ai/settings", {
        method: "PATCH",
        body: JSON.stringify({ alwaysAllowActions: next })
      });
      setSettings((current) => ({ ...current, alwaysAllowActions: result.alwaysAllowActions }));
      setNotice(enabled
        ? "Preference saved. Future matching actions will be applied automatically and remain undoable."
        : "Automatic approval revoked.");
    });
  }

  async function useRescheduleSuggestion(suggestion) {
    if (!reschedule) return;
    if (suggestion.strategy === "split") {
      await breakIntoSteps(reschedule.todo);
      return;
    }
    await previewAction({
      type: "move_todo",
      todoId: reschedule.todo._id,
      ...(suggestion.dueDate ? { dueDate: suggestion.dueDate } : {}),
      ...(suggestion.priority ? { priority: suggestion.priority } : {})
    });
  }

  const pendingTodos = todos.filter((todo) => todo.status === "pending");
  const actionTodo = todos.find((todo) => todo._id === actionPreview?.todoId);
  const priorDueDate = actionPreview?.previousValues?.dueDate ?? actionTodo?.dueDate;
  const priorPriority = actionPreview?.previousValues?.priority ?? actionTodo?.priority;
  const actionLabel = actionPreview?.type === "add_todo"
    ? "Add private todo"
    : `Update ${todos.find((todo) => todo._id === actionPreview?.todoId)?.title ?? "todo"}`;

  return (
    <WorkspaceLayout>
      <main className="phase-page ai-page">
        <p className="eyebrow">DAYMARK · YOUR PRIVATE ASSISTANT</p>
        <h1>AI study space</h1>
        <p className="ai-intro">Plan, break down, and reflect on your own tasks. Nothing changes without your review, unless you enable a specific always-allow action.</p>
        {!settings.configured && <p className="ai-not-configured" role="status">Gemini is not configured on the server yet. Ask your administrator to set <code>GEMINI_API_KEY</code>; it is never needed in your browser.</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {notice && <p className="success-copy" role="status">{notice}</p>}

        <nav aria-label="AI tools" className="ai-tabs">
          {sections.map(([id, label, Icon]) => (
            <button aria-current={active === id ? "page" : undefined} className={active === id ? "selected" : ""} key={id} onClick={() => setActive(id)} type="button">
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>

        {active === "suggestions" && <Panel title="A thoughtful plan for today" icon={Sparkles} description="Suggestions are based only on your recent completions, pending todos, and your profile preferences.">
          <button className="primary-button" disabled={!settings.configured || Boolean(busy)} onClick={makeSuggestions} type="button">{busy === "suggestions" ? "Thinking…" : "Analyze my pending tasks"}</button>
          {suggestions && <>
            <div className="ai-analysis"><strong>Pending-task analysis</strong><p>{suggestions.analysis}</p></div>
            {suggestions.suggestions.map((item, index) => <article className="ai-proposal" key={`${item.title}-${index}`}>
              <div><strong>{item.title}</strong><span>{localDateTime(item.dueDate)} · {priorities[item.priority]} · {item.estimatedMinutes} min</span><p>{item.description || "Suggested from your current workload."}</p></div>
              <button className="secondary-button" disabled={Boolean(busy)} onClick={() => previewAction({ type: "add_todo", ...item })} type="button">Review add</button>
            </article>)}
            {!suggestions.suggestions.length && <p className="phase-empty">No new tasks suggested. Your pending list may already cover today.</p>}
          </>}
        </Panel>}

        {active === "steps" && <Panel title="Make a big task feel smaller" icon={ListChecks} description="Generate four or five checklist steps, review them, then choose whether to save.">
          <TodoContextList todos={todos} onBreak={breakIntoSteps} onReschedule={getRescheduling} />
          {stepsDraft && <div className="ai-review">
            <h3>Review steps for “{stepsDraft.todo.title}”</h3>
            {stepsDraft.steps.map((step, index) => <label className="ai-step" key={`${index}-${step}`}>
              <input checked={stepsDraft.steps.includes(step)} onChange={(event) => setStepsDraft((current) => ({
                ...current,
                steps: event.target.checked
                  ? [...current.steps, step]
                  : current.steps.filter((item) => item !== step)
              }))} type="checkbox" />
              <span>{step}</span>
            </label>)}
            <button className="primary-button" disabled={!stepsDraft.steps.length || Boolean(busy)} onClick={saveSteps} type="button"><Check size={16} />Save reviewed steps</button>
            <button className="text-button" onClick={() => setStepsDraft(null)} type="button">Discard</button>
          </div>}
          {reschedule && <div className="ai-review">
            <h3>Rescheduling options for “{reschedule.todo.title}”</h3>
            <p className="muted-copy">This task has been postponed {reschedule.postponements} times. Choose an option to review its exact change.</p>
            {reschedule.suggestions.map((item, index) => <article className="ai-proposal" key={`${item.strategy}-${index}`}>
              <div><strong>{item.strategy === "split" ? "Split into steps" : item.strategy === "shift" ? "Shift due date" : "Adjust priority"}</strong><p>{item.explanation}</p>
                {item.dueDate && <span>New date: {localDateTime(item.dueDate)}</span>}
                {item.priority && <span>Priority: {priorities[item.priority]}</span>}
              </div>
              <button className="secondary-button" onClick={() => useRescheduleSuggestion(item)} type="button">Review option</button>
            </article>)}
          </div>}
        </Panel>}

        {active === "chat" && <Panel title="Ask about your tasks" icon={MessageSquareText} description="Answers use only your own active and recently completed todos. Ask a follow-up if you need to clarify.">
          <form className="ai-form" onSubmit={askQuestion}>
            <label htmlFor="task-question">Your question</label>
            <textarea id="task-question" maxLength={500} onChange={(event) => setChatMessage(event.target.value)} placeholder="Show tomorrow's pending tasks" required value={chatMessage} />
            <button className="primary-button" disabled={!settings.configured || Boolean(busy)} type="submit"><Send size={16} />Ask about my tasks</button>
          </form>
          {chatAnswer && <div className="ai-analysis"><strong>{chatAnswer.clarificationNeeded ? "A quick clarification" : "From your task list"}</strong><p>{chatAnswer.clarificationNeeded ? chatAnswer.clarifyingQuestion : chatAnswer.answer}</p></div>}
        </Panel>}

        {active === "goals" && <Panel title="Turn a goal into a plan" icon={Target} description="Review the generated milestones and daily tasks before anything is saved.">
          <form className="ai-form ai-goal-form" onSubmit={generateGoalPlan}>
            <label htmlFor="goal-prompt">What would you like to achieve?</label>
            <textarea id="goal-prompt" maxLength={500} onChange={(event) => setGoal(event.target.value)} placeholder="Prepare for my biology exam" required value={goal} />
            <label htmlFor="goal-target">Target date <span className="optional">(optional)</span></label>
            <input id="goal-target" min={localDate(new Date())} onChange={(event) => setGoalTargetDate(event.target.value)} type="date" value={goalTargetDate} />
            <button className="primary-button" disabled={!settings.configured || Boolean(busy)} type="submit">{busy === "goal" ? "Planning…" : "Generate reviewable plan"}</button>
          </form>
          {goalPlan && <div className="ai-review">
            <h3>{goalPlan.title}</h3><p>{goalPlan.description}</p>
            <p><strong>Milestones</strong></p>
            {goalPlan.milestones.map((item, index) => <div className="ai-plan-row" key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{item.targetDate}</span></div>)}
            <p><strong>Daily tasks ({goalPlan.dailyTasks.length})</strong></p>
            {goalPlan.dailyTasks.map((item, index) => <div className="ai-plan-row" key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{localDateTime(item.dueDate)} · {priorities[item.priority]}</span></div>)}
            <button className="primary-button" disabled={Boolean(busy)} onClick={saveGoalPlan} type="button"><Check size={16} />Approve and save plan</button>
            <button className="text-button" onClick={() => setGoalPlan(null)} type="button">Discard plan</button>
          </div>}
        </Panel>}

        {active === "voice" && <Panel title="Speak a todo, then review it" icon={Mic} description="Speech recognition stays in your browser. The transcript is sent to the backend only after you ask AI to parse it.">
          <button className="secondary-button" onClick={startVoiceCapture} type="button"><Mic size={16} />Start voice capture</button>
          <form className="ai-form" onSubmit={parseTranscript}>
            <label htmlFor="voice-transcript">Transcript</label>
            <textarea id="voice-transcript" maxLength={500} onChange={(event) => setTranscript(event.target.value)} placeholder="Tomorrow 5 PM submit Maths assignment" value={transcript} />
            <button className="primary-button" disabled={!settings.configured || !transcript.trim() || Boolean(busy)} type="submit">{busy === "voice" ? "Parsing…" : "Parse with AI"}</button>
          </form>
          {voiceDraft && <div className="ai-review">
            <h3>Review before creating</h3>
            <label className="ai-form">Title<input maxLength={120} onChange={(event) => setVoiceDraft((current) => ({ ...current, title: event.target.value }))} value={voiceDraft.title} /></label>
            <div className="ai-edit-grid">
              <label className="ai-form">Date<input onChange={(event) => setVoiceDraft((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={voiceDraft.dueDate} /></label>
              <label className="ai-form">Time<input onChange={(event) => setVoiceDraft((current) => ({ ...current, dueTime: event.target.value }))} type="time" value={voiceDraft.dueTime} /></label>
              <label className="ai-form">Priority<select onChange={(event) => setVoiceDraft((current) => ({ ...current, priority: event.target.value }))} value={voiceDraft.priority}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
            <button className="primary-button" disabled={!voiceDraft.title.trim() || Boolean(busy)} onClick={saveVoiceTodo} type="button"><Check size={16} />Create this private todo</button>
            <button className="text-button" onClick={() => setVoiceDraft(null)} type="button">Discard</button>
          </div>}
        </Panel>}

        {active === "report" && <Panel title="Your week, in perspective" icon={CalendarClock} description="Only your own task counts and time estimates are used. Reports clearly say when data is insufficient.">
          <button className="primary-button" disabled={!settings.configured || Boolean(busy)} onClick={loadWeeklyReport} type="button"><RefreshCw size={16} />Write weekly report</button>
          {report && <div className="ai-analysis">
            <strong>{report.insufficientData ? "Not enough data yet" : "Weekly productivity report"}</strong>
            <p>{report.report}</p>
            {!report.insufficientData && <p className="muted-copy">{report.summary.completed} completed · {report.summary.pending} pending · {report.summary.actualMinutes} actual minutes logged</p>}
          </div>}
        </Panel>}

        {active === "settings" && <Panel title="You control what AI can do" icon={Brain} description="AI never receives classmates' todos. Every request is made by the backend with your own account-scoped task data.">
          <div className="ai-privacy-note"><strong>Private by design</strong><p>Gemini requests run on the server. The API key is not sent to this page. Your task content is sent to Gemini only when you use an AI feature.</p></div>
          <h3>Always allow specific actions</h3>
          <p className="muted-copy">When enabled, matching proposed additions or moves apply automatically. They are still shown in the review panel and can be undone. Turn them off here at any time.</p>
          {[
            ["add_todo", "Automatically approve proposed todo additions"],
            ["move_todo", "Automatically approve proposed date or priority changes"]
          ].map(([key, label]) => <label className="ai-permission" key={key}>
            <input checked={settings.alwaysAllowActions.includes(key)} disabled={Boolean(busy)} onChange={savePermissions} type="checkbox" value={key} />
            <span>{label}</span>
          </label>)}
        </Panel>}

        {actionPreview && <section aria-live="polite" className="phase-card ai-review ai-action-review">
          <p className="eyebrow">CHANGE REVIEW</p>
          <h2>{actionLabel}</h2>
          {actionPreview.type === "add_todo"
            ? <div className="ai-plan-row"><strong>{actionPreview.title}</strong><span>{localDateTime(actionPreview.dueDate)} · {priorities[actionPreview.priority]} · {actionPreview.estimatedMinutes} min · Private</span></div>
            : <div className="ai-plan-row">
              <strong>{actionLabel}</strong>
              <span>
                {actionPreview.dueDate
                  ? `Due date: ${localDateTime(priorDueDate)} → ${localDateTime(actionPreview.dueDate)}`
                  : `Due date unchanged: ${localDateTime(priorDueDate)}`}
                {" · "}
                {actionPreview.priority
                  ? `Priority: ${priorities[priorPriority] ?? priorPriority} → ${priorities[actionPreview.priority]}`
                  : `Priority unchanged: ${priorities[priorPriority] ?? priorPriority}`}
              </span>
            </div>}
          {!actionPreview.automaticallyApplied
            ? <button className="primary-button" disabled={Boolean(busy)} onClick={approveAction} type="button"><Check size={16} />Approve this exact change</button>
            : <button className="secondary-button" disabled={Boolean(busy)} onClick={undoAction} type="button"><Undo2 size={16} />Undo change</button>}
          {!actionPreview.automaticallyApplied && <button className="text-button" onClick={() => setActionPreview(null)} type="button">Cancel</button>}
        </section>}

        {active === "steps" && pendingTodos.length > 0 && <p className="ai-subtle"><Clock3 size={14} /> The task list above shows estimates alongside actual tracked time.</p>}
      </main>
    </WorkspaceLayout>
  );
}
