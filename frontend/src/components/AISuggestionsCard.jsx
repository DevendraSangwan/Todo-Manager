import { useState } from "react";
import { Check, Sparkles, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

const priorityLabels = {
  "urgent-important": "Urgent + Important",
  "important-not-urgent": "Important, not Urgent",
  "urgent-not-important": "Urgent, not Important",
  neither: "Neither"
};
const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
}).format(new Date(value));

export default function AISuggestionsCard({ onApplied }) {
  const [suggestions, setSuggestions] = useState(null);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function suggest() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const [result, preferences] = await Promise.all([
        api("/ai/suggestions", { method: "POST", body: "{}" }),
        api("/ai/settings")
      ]);
      setSuggestions(result);
      setSettings(preferences);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(item) {
    setBusy(true);
    setError("");
    try {
      const action = { type: "add_todo", ...item };
      const result = await api("/ai/actions/preview", { method: "POST", body: JSON.stringify(action) });
      setPreview({ id: result.action._id, ...action, automaticallyApplied: result.automaticallyApplied });
      if (result.automaticallyApplied) {
        setNotice("Added using your always-allow setting. You can undo it below.");
        await onApplied();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await api(`/ai/actions/${preview.id}/approve`, { method: "POST", body: "{}" });
      setPreview((current) => ({ ...current, automaticallyApplied: true }));
      setNotice("Approved and added. Undo it here if you change your mind.");
      await onApplied();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await api(`/ai/actions/${preview.id}/undo`, { method: "POST", body: "{}" });
      setPreview(null);
      setNotice("The AI suggestion was undone.");
      await onApplied();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="phase-card ai-dashboard-card">
      <div className="ai-panel-heading">
        <span className="ai-icon"><Sparkles size={18} /></span>
        <div><h2>AI suggestions</h2><p>Analyze your pending work and get ideas for today.</p></div>
        <button className="secondary-button compact-button" disabled={busy} onClick={suggest} type="button">{busy ? "Thinking…" : "Suggest"}</button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="success-copy" role="status">{notice}</p>}
      {suggestions && <div className="ai-dashboard-suggestions">
        <p>{suggestions.analysis}</p>
        {suggestions.suggestions.map((item, index) => <article className="ai-proposal" key={`${item.title}-${index}`}>
          <div><strong>{item.title}</strong><span>{formatDate(item.dueDate)} · {priorityLabels[item.priority]} · {item.estimatedMinutes} min</span></div>
          <button className="secondary-button compact-button" disabled={busy} onClick={() => review(item)} type="button">Review add</button>
        </article>)}
        {!suggestions.suggestions.length && <p className="phase-empty">No extra tasks suggested for today.</p>}
      </div>}
      {preview && <div className="ai-review ai-dashboard-review">
        <strong>Review this exact private todo</strong>
        <p>{preview.title} · {formatDate(preview.dueDate)} · {priorityLabels[preview.priority]} · {preview.estimatedMinutes} min</p>
        {!preview.automaticallyApplied
          ? <button className="primary-button" disabled={busy} onClick={approve} type="button"><Check size={15} />Approve</button>
          : <button className="secondary-button" disabled={busy} onClick={undo} type="button"><Undo2 size={15} />Undo</button>}
        {!preview.automaticallyApplied && <button className="text-button" onClick={() => setPreview(null)} type="button">Cancel</button>}
      </div>}
      <Link className="text-button ai-workspace-link" to="/ai">Open AI study space</Link>
      {settings && !settings.configured && <p className="muted-copy">Gemini isn't configured on the server yet.</p>}
    </section>
  );
}
