import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { formatUserDateTime } from "../lib/date.js";

function PageShell({ title, children }) {
  return (
    <WorkspaceLayout>
      <main className="phase-page">
        <p className="eyebrow">DAYMARK · SETTINGS & CLASSROOM</p>
        <h1>{title}</h1>
        {children}
      </main>
    </WorkspaceLayout>
  );
}

function ErrorMessage({ children }) {
  return children ? <p className="inline-error" role="alert">{children}</p> : null;
}

const defaultSettings = {
  displayName: "",
  email: "",
  theme: "light",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  notificationPreferences: { inApp: true, email: false, browser: false },
  reminderMinutes: 15,
  aiDataPermission: true,
  reducedMotion: false
};

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(defaultSettings);
  const [sessions, setSessions] = useState([]);
  const [tab, setTab] = useState("profile");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  async function load() {
    try {
      const [settingsResult, sessionsResult] = await Promise.all([
        api("/settings"),
        api("/auth/sessions")
      ]);
      setSettings({
        ...defaultSettings,
        ...settingsResult.settings,
        notificationPreferences: {
          ...defaultSettings.notificationPreferences,
          ...settingsResult.settings.notificationPreferences
        }
      });
      setSessions(sessionsResult.sessions);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { load(); }, []);

  function updateField(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  function updateNotification(key, value) {
    setSettings((current) => ({
      ...current,
      notificationPreferences: { ...current.notificationPreferences, [key]: value }
    }));
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (settings.notificationPreferences.browser && !("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }
    if (settings.notificationPreferences.browser) {
      let permission;
      try {
        permission = Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      } catch (requestError) {
        setError(requestError.message);
        return;
      }
      if (permission !== "granted") {
        setError("Allow browser notifications in your browser to enable this preference.");
        updateNotification("browser", false);
        return;
      }
    }
    setSaving(true);
    try {
      const { user: updatedUser } = await api("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: settings.displayName,
          theme: settings.theme,
          timezone: settings.timezone,
          notificationPreferences: settings.notificationPreferences,
          reminderMinutes: Number(settings.reminderMinutes),
          aiDataPermission: settings.aiDataPermission,
          reducedMotion: settings.reducedMotion
        })
      });
      localStorage.setItem("daymark-timezone", updatedUser.timezone);
      setUser(updatedUser);
      setSettings({
        ...defaultSettings,
        ...updatedUser,
        notificationPreferences: {
          ...defaultSettings.notificationPreferences,
          ...updatedUser.notificationPreferences
        }
      });
      setNotice("Your settings have been saved.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function logoutOtherSessions() {
    setError("");
    try {
      const result = await api("/auth/logout-others", { method: "POST" });
      setNotice(`${result.revoked} other session${result.revoked === 1 ? "" : "s"} logged out.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setError("");
    if (deleteConfirmation !== "DELETE") {
      setError('Type "DELETE" to confirm account deletion.');
      return;
    }
    try {
      await api("/settings/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation })
      });
      localStorage.removeItem("daymark-timezone");
      setUser(null);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const tabs = [
    ["profile", "Profile"],
    ["notifications", "Notifications"],
    ["privacy", "Privacy"],
    ["security", "Security"],
    ["data", "Data & account"]
  ];

  return (
    <PageShell title="Settings">
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <p className="form-success" role="status">{notice}</p>}
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map(([id, label]) => (
          <button aria-selected={tab === id} className={`secondary-button${tab === id ? " selected" : ""}`} id={`settings-tab-${id}`} key={id} onClick={() => setTab(id)} role="tab" type="button">
            {label}
          </button>
        ))}
      </div>

      <section className="phase-card settings-form">
        {tab === "profile" && <>
          <h2>Profile</h2>
          <label className="phase-field">Display name
            <input autoComplete="name" maxLength={80} onChange={(event) => updateField("displayName", event.target.value)} value={settings.displayName} />
          </label>
          <label className="phase-field">Email address
            <input readOnly value={settings.email} />
          </label>
          <label className="phase-field">Timezone
            <select onChange={(event) => updateField("timezone", event.target.value)} value={settings.timezone}>
              {Intl.supportedValuesOf("timeZone").map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              {!Intl.supportedValuesOf("timeZone").includes(settings.timezone) && <option value={settings.timezone}>{settings.timezone}</option>}
            </select>
          </label>
          <label className="phase-field">Theme
            <select onChange={(event) => updateField("theme", event.target.value)} value={settings.theme}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="settings-check">
            <input checked={settings.reducedMotion} onChange={(event) => updateField("reducedMotion", event.target.checked)} type="checkbox" />
            Use reduced motion
          </label>
          <p className="muted-copy">Keyboard shortcuts: press <kbd>?</kbd> for help; use <kbd>g</kbd> then <kbd>d</kbd>, <kbd>t</kbd>, or <kbd>s</kbd> to navigate.</p>
        </>}
        {tab === "notifications" && <>
          <h2>Notifications & reminders</h2>
          {[
            ["inApp", "In-app reminders"],
            ["email", "Email reminders"],
            ["browser", "Browser notifications"]
          ].map(([key, label]) => (
            <label className="settings-check" key={key}>
              <input checked={Boolean(settings.notificationPreferences[key])} onChange={(event) => updateNotification(key, event.target.checked)} type="checkbox" />
              {label}
            </label>
          ))}
          <label className="phase-field">Remind me before a task is due
            <select onChange={(event) => updateField("reminderMinutes", Number(event.target.value))} value={settings.reminderMinutes}>
              <option value="0">Off</option>
              {[5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </label>
          <p className="muted-copy">Email reminders require SMTP delivery configured by the server administrator. Browser notifications are sent while this workspace is open.</p>
        </>}
        {tab === "privacy" && <>
          <h2>Privacy</h2>
          <label className="settings-check">
            <input checked={settings.aiDataPermission} onChange={(event) => updateField("aiDataPermission", event.target.checked)} type="checkbox" />
            Allow AI features to process my task data
          </label>
          <p className="muted-copy">When turned off, AI endpoints are blocked for your account. Your tasks remain private and are not shared with classmates unless you explicitly share them.</p>
        </>}
        {tab === "security" && <>
          <h2>Active sessions</h2>
          <p className="muted-copy">Signed-in browsers and devices. Logging out other sessions keeps this one active.</p>
          <button className="secondary-button" disabled={sessions.filter((session) => !session.current).length === 0} onClick={logoutOtherSessions} type="button">Log out from other devices</button>
          <div className="phase-list">
            {sessions.map((session) => (
              <div className="phase-row" key={session.id}>
                <div><strong>{session.current ? "This device" : "Signed-in device"}</strong><span className="phase-subline">{session.userAgent || "Browser"} · {session.ipAddress || "IP unavailable"}</span></div>
                <span>{formatUserDateTime(session.createdAt)}</span>
              </div>
            ))}
            {!sessions.length && <p className="phase-empty">No active sessions found.</p>}
          </div>
        </>}
        {tab === "data" && <>
          <h2>Your data</h2>
          <p className="muted-copy">Download a copy of your profile, tasks, goals, habits, focus sessions, progress, and assignment submissions.</p>
          <div className="phase3-actions">
            <a className="secondary-button" href="/api/settings/export?format=csv">Download my data (CSV)</a>
            <a className="secondary-button" href="/api/settings/export?format=pdf">Download my data (PDF)</a>
          </div>
          {user?.role !== "SUPER_ADMIN" && <form className="account-delete-form" onSubmit={deleteAccount}>
            <h3>Delete account</h3>
            <p className="muted-copy">This permanently deletes your account and personal data. This cannot be undone.</p>
            <label className="phase-field">Password
              <input autoComplete="current-password" onChange={(event) => setDeletePassword(event.target.value)} required type="password" value={deletePassword} />
            </label>
            <label className="phase-field">Type DELETE to confirm
              <input onChange={(event) => setDeleteConfirmation(event.target.value)} required value={deleteConfirmation} />
            </label>
            <button className="danger-button" type="submit">Delete account</button>
          </form>}
        </>}
        {tab !== "security" && tab !== "data" && <button className="primary-button" disabled={saving} onClick={save} type="button">{saving ? "Saving…" : "Save settings"}</button>}
      </section>
    </PageShell>
  );
}

export function ClassroomPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER_ADMIN";
  const [tab, setTab] = useState("assignments");
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ title: "", description: "", dueDate: "" });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", message: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const maxTrend = Math.max(1, ...(analytics?.weeklyTrend ?? []).map((day) => day.submitted));

  async function loadStudents() {
    const firstPage = await api("/classes/mine?limit=50");
    const remainingPages = Array.from({ length: firstPage.pagination.pages - 1 }, (_, index) => index + 2);
    const otherPages = await Promise.all(remainingPages.map((page) => api(`/classes/mine?page=${page}&limit=50`)));
    return [...firstPage.students, ...otherPages.flatMap((page) => page.students)];
  }

  async function load() {
    try {
      const requests = [
        api("/classroom/assignments"),
        api("/classroom/announcements")
      ];
      if (isTeacher) requests.push(api("/classroom/analytics"), loadStudents());
      const results = await Promise.all(requests);
      setAssignments(results[0].assignments);
      setAnnouncements(results[1].announcements);
      if (isTeacher) {
        setAnalytics(results[2]);
        setStudents(results[3]);
      }
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { load(); }, [isTeacher]);

  async function createAssignment(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/classroom/assignments", {
        method: "POST",
        body: JSON.stringify({
          ...assignmentForm,
          dueDate: new Date(assignmentForm.dueDate).toISOString(),
          ...(allStudents ? {} : { studentIds: selectedStudents })
        })
      });
      setAssignmentForm({ title: "", description: "", dueDate: "" });
      setNotice("Assignment created.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function submitAssignment(assignmentId, event) {
    event.preventDefault();
    const response = new FormData(event.currentTarget).get("response");
    setError("");
    try {
      await api(`/classroom/assignments/${assignmentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ response })
      });
      setNotice("Assignment submitted.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function createAnnouncement(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/classroom/announcements", { method: "POST", body: JSON.stringify(announcementForm) });
      setAnnouncementForm({ title: "", message: "" });
      setNotice("Announcement posted to your class.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <PageShell title={isTeacher ? "Classroom" : "My classroom"}>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <p className="form-success" role="status">{notice}</p>}
      {isTeacher && <div className="settings-tabs" role="tablist" aria-label="Classroom sections">
        {[["assignments", "Assignments"], ["announcements", "Announcements"], ["analytics", "Analytics"]].map(([id, label]) => (
          <button aria-selected={tab === id} className={`secondary-button${tab === id ? " selected" : ""}`} key={id} onClick={() => setTab(id)} role="tab" type="button">{label}</button>
        ))}
      </div>}

      {tab === "assignments" && <>
        {isTeacher && <form className="phase-card todo-form classroom-form" onSubmit={createAssignment}>
          <h2>Create assignment</h2>
          <label>Title<input maxLength={120} onChange={(event) => setAssignmentForm({ ...assignmentForm, title: event.target.value })} required value={assignmentForm.title} /></label>
          <label>Instructions<textarea maxLength={2000} onChange={(event) => setAssignmentForm({ ...assignmentForm, description: event.target.value })} value={assignmentForm.description} /></label>
          <label>Deadline<input onChange={(event) => setAssignmentForm({ ...assignmentForm, dueDate: event.target.value })} required type="datetime-local" value={assignmentForm.dueDate} /></label>
          <label className="settings-check"><input checked={allStudents} onChange={(event) => setAllStudents(event.target.checked)} type="checkbox" /> Assign to the whole class</label>
          {!allStudents && <fieldset className="student-picker"><legend>Select students</legend>
            {students.map((student) => <label key={student._id}><input checked={selectedStudents.includes(student._id)} onChange={(event) => setSelectedStudents((current) => event.target.checked ? [...current, student._id] : current.filter((id) => id !== student._id))} type="checkbox" />{student.email}</label>)}
          </fieldset>}
          <button className="primary-button" type="submit">Create assignment</button>
        </form>}
        <section className="phase-card">
          <h2>{isTeacher ? "Assignments & submissions" : "Class assignments"}</h2>
          {assignments.map((assignment) => (
            <article className="phase-card assignment-card" key={assignment._id}>
              <div className="phase-row"><div><strong>{assignment.title}</strong><span className="phase-subline">Due {formatUserDateTime(assignment.dueDate)}</span></div>
                {!isTeacher && <span className={`status-pill ${assignment.submission?.submittedAt ? assignment.late ? "overdue" : "complete" : assignment.overdue ? "overdue" : ""}`}>{assignment.submission?.submittedAt ? assignment.late ? "Submitted late" : "Submitted" : assignment.overdue ? "Overdue" : "Not submitted"}</span>}
              </div>
              {assignment.description && <p>{assignment.description}</p>}
              {isTeacher
                ? <div className="phase-list">{(assignment.submissions ?? []).map((submission) => <div className="phase-row" key={submission.student?._id}><span>{submission.student?.email}</span><span>{submission.submittedAt ? `${submission.late ? "Late" : "Submitted"} · ${formatUserDateTime(submission.submittedAt)}` : new Date(assignment.dueDate) < new Date() ? "Overdue" : "Pending"}</span></div>)}</div>
                : assignment.submission?.submittedAt
                  ? <p className="muted-copy">Submitted {formatUserDateTime(assignment.submission.submittedAt)}{assignment.submission.response ? ` · ${assignment.submission.response}` : ""}</p>
                  : <form className="todo-form" onSubmit={(event) => submitAssignment(assignment._id, event)}>
                    <label>Submission note <textarea maxLength={2000} name="response" /></label>
                    <button className="primary-button" type="submit">Submit assignment</button>
                  </form>}
            </article>
          ))}
          {!assignments.length && <p className="phase-empty">No assignments yet.</p>}
        </section>
      </>}

      {tab === "announcements" && <>
        {isTeacher && <form className="phase-card todo-form classroom-form" onSubmit={createAnnouncement}>
          <h2>Post an announcement</h2>
          <label>Title<input maxLength={120} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} required value={announcementForm.title} /></label>
          <label>Message<textarea maxLength={3000} onChange={(event) => setAnnouncementForm({ ...announcementForm, message: event.target.value })} required value={announcementForm.message} /></label>
          <button className="primary-button" type="submit">Post announcement</button>
        </form>}
        <section className="phase-card">
          <h2>Class announcements</h2>
          {announcements.map((announcement) => <article className="phase-row announcement-row" key={announcement._id}>
            <div><strong>{announcement.title}</strong><p>{announcement.message}</p><span className="phase-subline">{announcement.teacherId?.email} · {formatUserDateTime(announcement.createdAt)}</span></div>
          </article>)}
          {!announcements.length && <p className="phase-empty">No announcements yet.</p>}
        </section>
      </>}

      {isTeacher && tab === "analytics" && <section className="phase-card">
        <h2>Class analytics</h2>
        <p className="muted-copy">Metrics are based only on class assignments and submissions. Private personal todos are not queried.</p>
        {analytics && <>
          <div className="analytics-summary">
            <article><strong>{analytics.completionPercentage}%</strong><span>Completion</span></article>
            <article><strong>{analytics.overdue}</strong><span>Overdue submissions</span></article>
            <article><strong>{analytics.totalAssignments}</strong><span>Assignments</span></article>
            <article><strong>{analytics.submitted}/{analytics.totalSubmissions}</strong><span>Submitted</span></article>
          </div>
          <h3>Weekly submissions</h3>
          <div className="weekly-trend">
            {analytics.weeklyTrend.map((day) => <div className="trend-row" key={day.date}><span>{day.date}</span><div aria-label={`${day.submitted} submissions`} aria-valuemax={maxTrend} aria-valuemin="0" aria-valuenow={day.submitted} className="trend-track" role="meter"><span style={{ width: `${day.submitted / maxTrend * 100}%` }} /></div><strong>{day.submitted}</strong></div>)}
          </div>
        </>}
      </section>}
    </PageShell>
  );
}
