import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

function PageShell({ title, children }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="topbar-brand" to="/dashboard"><span className="brand-mark small">D</span><span>daymark<span className="brand-period">.</span></span></Link>
        <nav className="phase-nav" aria-label="Main navigation">
          <Link to="/dashboard">Todos</Link>
          {user?.role === "SUPER_ADMIN" && <Link to="/admin">Admin</Link>}
          {user?.role === "TEACHER_ADMIN" && <Link to="/teacher">Teacher</Link>}
          {user?.classId && user.role === "STUDENT" && <Link to="/classmates">Classmates</Link>}
          <Link to="/friends">Friends</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
        <div className="topbar-actions"><span className="user-email">{user?.email}</span><button className="logout-button" onClick={logout} type="button">Log out</button></div>
      </header>
      <main className="phase-page">
        <ErrorMessage>{logoutError}</ErrorMessage>
        <p className="eyebrow">DAYMARK · PHASE 2</p>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

function ErrorMessage({ children }) {
  return children ? <p className="inline-error" role="alert">{children}</p> : null;
}

export function OnboardingPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [choice, setChoice] = useState("");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/classes?limit=50").then(({ classes: available }) => setClasses(available)).catch((requestError) => setError(requestError.message));
  }, []);

  async function continueSetup() {
    setBusy(true);
    setError("");
    try {
      const body = choice === "personal"
        ? { accountType: "personal" }
        : { accountType: "class", classId };
      const { user } = await api("/auth/setup", { method: "POST", body: JSON.stringify(body) });
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="How will you use Daymark?">
      <section className="phase-card">
        <p>Choose a space to get started. Class membership starts only after your teacher approves your request.</p>
        <div className="choice-grid">
          <button className={`choice-card${choice === "personal" ? " selected" : ""}`} onClick={() => setChoice("personal")} type="button">
            <strong>Personal use</strong><span>Keep your todos private to you.</span>
          </button>
          <button className={`choice-card${choice === "class" ? " selected" : ""}`} onClick={() => setChoice("class")} type="button">
            <strong>Join a class</strong><span>Share selected todos with classmates.</span>
          </button>
        </div>
        {choice === "class" && (
          <label className="phase-field">Choose a class
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">Select a class…</option>
              {classes.map((classroom) => <option key={classroom._id} value={classroom._id}>{classroom.name}</option>)}
            </select>
          </label>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        <button className="primary-button" disabled={!choice || (choice === "class" && !classId) || busy} onClick={continueSetup} type="button">
          {busy ? "Saving…" : choice === "class" ? "Send join request" : "Go to my dashboard"}
        </button>
      </section>
    </PageShell>
  );
}

export function AdminPage() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [error, setError] = useState("");
  const [teacherForm, setTeacherForm] = useState({ email: "", password: "" });
  const [classForm, setClassForm] = useState({ name: "", description: "", teacherId: "" });

  async function load() {
    try {
      const [classResult, teacherResult] = await Promise.all([api("/classes?limit=50"), api("/admin/teachers?limit=50")]);
      setClasses(classResult.classes);
      setTeachers(teacherResult.teachers);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function createTeacher(event) {
    event.preventDefault();
    try {
      await api("/admin/teachers", { method: "POST", body: JSON.stringify(teacherForm) });
      setTeacherForm({ email: "", password: "" });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function createClass(event) {
    event.preventDefault();
    try {
      await api("/classes", {
        method: "POST",
        body: JSON.stringify({ ...classForm, teacherId: classForm.teacherId || null })
      });
      setClassForm({ name: "", description: "", teacherId: "" });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateClass(id, values) {
    try {
      await api(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(values) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteClass(id) {
    if (!window.confirm("Delete this class? Students will be detached from it.")) return;
    try {
      await api(`/classes/${id}`, { method: "DELETE" });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTeacher(event, teacher) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const update = {};
    const email = data.get("email").trim();
    const password = data.get("password");
    if (email !== teacher.email) update.email = email;
    if (password) update.password = password;
    if (!Object.keys(update).length) return;
    try {
      await api(`/admin/teachers/${teacher._id}`, { method: "PATCH", body: JSON.stringify(update) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteTeacher(id) {
    if (!window.confirm("Delete this teacher account?")) return;
    try {
      await api(`/admin/teachers/${id}`, { method: "DELETE" });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <PageShell title="Super admin">
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Teachers</h2>
        <form className="phase-form" onSubmit={createTeacher}>
          <input aria-label="Teacher email" type="email" placeholder="Teacher email" required value={teacherForm.email} onChange={(event) => setTeacherForm({ ...teacherForm, email: event.target.value })} />
          <input aria-label="Temporary password" type="password" minLength={8} placeholder="Temporary password" required value={teacherForm.password} onChange={(event) => setTeacherForm({ ...teacherForm, password: event.target.value })} />
          <button className="primary-button" type="submit">Create teacher</button>
        </form>
        <div className="phase-list">
          {teachers.map((teacher) => (
            <form className="phase-row teacher-row" key={teacher._id} onSubmit={(event) => updateTeacher(event, teacher)}>
              <input aria-label="Teacher email" defaultValue={teacher.email} name="email" type="email" required />
              <input aria-label="New password (optional)" name="password" minLength={8} placeholder="New password (optional)" type="password" />
              <span>{teacher.class?.name ?? "Unassigned"}</span>
              <button className="text-button" type="submit">Save</button>
              <button className="text-button danger-text" onClick={() => deleteTeacher(teacher._id)} type="button">Delete</button>
            </form>
          ))}
          {!teachers.length && <p className="phase-empty">No teacher accounts yet.</p>}
        </div>
      </section>
      <section className="phase-card">
        <h2>Classes</h2>
        <form className="phase-form" onSubmit={createClass}>
          <input aria-label="Class name" placeholder="Class name" required value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} />
          <input aria-label="Description" placeholder="Description (optional)" value={classForm.description} onChange={(event) => setClassForm({ ...classForm, description: event.target.value })} />
          <select aria-label="Assign a teacher" value={classForm.teacherId} onChange={(event) => setClassForm({ ...classForm, teacherId: event.target.value })}>
            <option value="">No teacher assigned</option>
            {teachers.filter((teacher) => !teacher.class).map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.email}</option>)}
          </select>
          <button className="primary-button" type="submit">Create class</button>
        </form>
        <div className="phase-list">
          {classes.map((classroom) => (
            <form className="phase-row class-row" key={classroom._id} onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              updateClass(classroom._id, {
                name: data.get("name").trim(),
                description: data.get("description").trim(),
                teacherId: data.get("teacherId") || null
              });
            }}>
              <input aria-label="Class name" defaultValue={classroom.name} name="name" required />
              <input aria-label="Class description" defaultValue={classroom.description} name="description" />
              <select aria-label="Assigned teacher" defaultValue={classroom.teacherId?._id ?? ""} name="teacherId">
                <option value="">No teacher assigned</option>
                {teachers.filter((teacher) => !teacher.class || teacher.class._id === classroom._id).map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.email}</option>)}
              </select>
              <button className="text-button" type="submit">Save</button>
              <button className="text-button danger-text" onClick={() => deleteClass(classroom._id)} type="button">Delete</button>
            </form>
          ))}
          {!classes.length && <p className="phase-empty">No classes yet.</p>}
        </div>
      </section>
    </PageShell>
  );
}

export function TeacherPage() {
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [classResult, requestResult] = await Promise.all([api("/classes/mine?limit=50"), api("/requests/class/pending?limit=50")]);
      setClassroom(classResult.class);
      setStudents(classResult.students);
      setRequests(requestResult.requests);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }
  useEffect(() => { load(); }, []);

  async function answerRequest(id, decision) {
    try {
      await api(`/requests/${id}`, { method: "PATCH", body: JSON.stringify({ decision }) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function showStudent(student) {
    setSelectedStudent(student);
    try {
      const result = await api(`/classes/mine/students/${student._id}/todos?limit=50`);
      setTodos(result.todos);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }

  async function saveTodo(todo, event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const update = {
      title: data.get("title").trim(),
      description: data.get("description").trim(),
      status: data.get("status"),
      visibility: data.get("visibility"),
      priority: data.get("priority"),
      dueDate: new Date(`${data.get("dueDate")}T12:00:00`).toISOString()
    };
    try {
      await api(`/todos/${todo._id}`, { method: "PATCH", body: JSON.stringify(update) });
      await showStudent(selectedStudent);
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <PageShell title={classroom ? `${classroom.name} · Teacher` : "Teacher panel"}>
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Pending join requests <span className="count-pill">{requests.length}</span></h2>
        {requests.map((request) => (
          <div className="phase-row request-row" key={request._id}>
            <span>{request.requesterId?.email ?? "Student"}</span>
            <div><button className="primary-button compact-button" onClick={() => answerRequest(request._id, "approved")} type="button">Approve</button>
              <button className="secondary-button" onClick={() => answerRequest(request._id, "rejected")} type="button">Reject</button></div>
          </div>
        ))}
        {!requests.length && <p className="phase-empty">No pending requests.</p>}
      </section>
      <section className="phase-card">
        <h2>Class students</h2>
        <div className="phase-list">
          {students.map((student) => (
            <button className={`phase-row student-button${selectedStudent?._id === student._id ? " selected" : ""}`} key={student._id} onClick={() => showStudent(student)} type="button">
              <span>{student.email}</span><span>View todos →</span>
            </button>
          ))}
          {!students.length && <p className="phase-empty">No approved students in this class yet.</p>}
        </div>
      </section>
      {selectedStudent && <section className="phase-card">
        <h2>Todos for {selectedStudent.email}</h2>
        <p className="muted-copy">Only todos created for this class are shown. Personal-account todos are never included.</p>
        {todos.map((todo) => (
          <form className="phase-row teacher-todo-row" key={todo._id} onSubmit={(event) => saveTodo(todo, event)}>
            <input aria-label="Todo title" defaultValue={todo.title} name="title" required />
            <input aria-label="Todo description" defaultValue={todo.description} name="description" />
            <input aria-label="Todo due date" defaultValue={new Date(todo.dueDate).toISOString().slice(0, 10)} name="dueDate" type="date" required />
            <select aria-label="Todo status" defaultValue={todo.status} name="status"><option value="pending">Pending</option><option value="completed">Completed</option></select>
            <select aria-label="Todo priority" defaultValue={todo.priority} name="priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
            <select aria-label="Todo visibility" defaultValue={todo.visibility} name="visibility"><option value="private">Private</option><option value="classmates">Classmates</option><option value="public">Public</option></select>
            <button className="text-button" type="submit">Save changes</button>
          </form>
        ))}
        {!todos.length && <p className="phase-empty">This student has no class todos.</p>}
      </section>}
    </PageShell>
  );
}

export function ClassmatesPage() {
  const [result, setResult] = useState({ students: [], todos: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    api("/classes/students?limit=50").then(setResult).catch((requestError) => setError(requestError.message));
  }, []);
  return (
    <PageShell title="Classmates’ todos">
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Classmates</h2>
        {result.students.map((student) => <p className="phase-person" key={student._id}>{student.email}</p>)}
        {!result.students.length && <p className="phase-empty">No classmates to show yet.</p>}
      </section>
      <section className="phase-card">
        <h2>Shared todos</h2>
        {result.todos.map((todo) => (
          <article className="phase-row" key={todo._id}>
            <div><strong>{todo.title}</strong><span className="phase-subline">{todo.userId?.email} · {todo.visibility}</span></div>
            <span>{new Date(todo.dueDate).toLocaleDateString()}</span>
          </article>
        ))}
        {!result.todos.length && <p className="phase-empty">No classmates’ todos have been shared.</p>}
      </section>
    </PageShell>
  );
}

export function FriendsPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [friendId, setFriendId] = useState("");
  const [friends, setFriends] = useState([]);
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const { answers } = await api("/requests?limit=50");
      const accepted = answers.filter((request) =>
        request.kind === "friend_access" &&
        request.status === "approved" &&
        request.requesterId?._id === user.id
      );
      const byId = new Map();
      accepted.forEach((request) => {
        const other = request.recipientId?._id ? request.recipientId : null;
        if (other) byId.set(other._id, other);
      });
      setFriends([...byId.values()]);
    } catch (requestError) { setError(requestError.message); }
  }
  useEffect(() => { load();   }, [user.id]);

  async function requestAccess(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api("/requests/friend-access", { method: "POST", body: JSON.stringify({ email }) });
      setEmail("");
      setNotice("Your friend access request was sent.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function viewFriend(id) {
    setFriendId(id);
    try {
      const result = await api(`/friends/${id}/todos`);
      setTodos(result.todos);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <PageShell title="Friends">
      <section className="phase-card">
        <h2>Request access</h2>
        <p>Enter a friend’s email. They choose whether to share their non-private todos; access is read-only.</p>
        <form className="phase-form" onSubmit={requestAccess}>
          <input aria-label="Friend email" type="email" placeholder="friend@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="primary-button" type="submit">Send request</button>
        </form>
        {notice && <p className="success-copy">{notice}</p>}
        <ErrorMessage>{error}</ErrorMessage>
      </section>
      <section className="phase-card">
        <h2>Friends who approved</h2>
        <div className="friend-buttons">
          {friends.map((friend) => <button className={friendId === friend._id ? "selected" : ""} key={friend._id} onClick={() => viewFriend(friend._id)} type="button">{friend.email}</button>)}
          {!friends.length && <p className="phase-empty">Approved friend access will appear here.</p>}
        </div>
        {todos.map((todo) => <article className="phase-row" key={todo._id}><strong>{todo.title}</strong><span>{new Date(todo.dueDate).toLocaleDateString()}</span></article>)}
      </section>
    </PageShell>
  );
}

export function NotificationsPage() {
  const [requests, setRequests] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [requestResult, notificationResult] = await Promise.all([api("/requests"), api("/notifications")]);
      setRequests(requestResult.requests);
      setAnswers(requestResult.answers);
      setMessages(notificationResult.notifications);
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }
  useEffect(() => { load(); }, []);

  async function decide(id, decision) {
    try {
      await api(`/requests/${id}`, { method: "PATCH", body: JSON.stringify({ decision }) });
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function sendMessage(event) {
    event.preventDefault();
    try {
      await api("/notifications/messages", { method: "POST", body: JSON.stringify({ email, message }) });
      setEmail("");
      setMessage("");
      setError("");
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <PageShell title="Notifications">
      <ErrorMessage>{error}</ErrorMessage>
      <section className="phase-card">
        <h2>Requests</h2>
        {requests.map((request) => (
          <div className="phase-row request-row" key={request._id}>
            <span>{request.kind === "join_class" ? `${request.requesterId?.email} wants to join ${request.classId?.name ?? "your class"}` : `${request.requesterId?.email} requests todo access`}</span>
            <div><button className="primary-button compact-button" onClick={() => decide(request._id, "approved")} type="button">Allow</button><button className="secondary-button" onClick={() => decide(request._id, "rejected")} type="button">Reject</button></div>
          </div>
        ))}
        {!requests.length && <p className="phase-empty">No requests waiting for your answer.</p>}
      </section>
      <section className="phase-card">
        <h2>Answers</h2>
        {answers.map((answer) => <p className="phase-row" key={answer._id}>
          <span>{answer.kind === "join_class" ? `${answer.classId?.name ?? "Class"} join request` : `Friend access · ${answer.recipientId?.email ?? answer.requesterId?.email}`}</span>
          <strong className={`status-${answer.status}`}>{answer.status}</strong>
        </p>)}
        {messages.map((item) => <p className="phase-row" key={item._id}><span>{item.senderId?.email}: {item.message}</span><span>{new Date(item.createdAt).toLocaleString()}</span></p>)}
        {!answers.length && !messages.length && <p className="phase-empty">No answers or messages yet.</p>}
      </section>
      <section className="phase-card">
        <h2>Send a message</h2>
        <p>Messages can be sent to a classmate or an approved friend.</p>
        <form className="phase-form message-form" onSubmit={sendMessage}>
          <input aria-label="Recipient email" type="email" placeholder="Recipient email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <input aria-label="Message" maxLength={500} placeholder="Write a short message…" required value={message} onChange={(event) => setMessage(event.target.value)} />
          <button className="primary-button" type="submit">Send message</button>
        </form>
      </section>
    </PageShell>
  );
}
