import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import AssignmentSubmission from "../src/models/AssignmentSubmission.js";
import Assignment from "../src/models/Assignment.js";
import AuthToken from "../src/models/AuthToken.js";
import Class from "../src/models/Class.js";
import Session from "../src/models/Session.js";
import Todo from "../src/models/Todo.js";
import User from "../src/models/User.js";

const secret = "phase-six-test-secret-with-at-least-32-characters";
const studentId = "66a000000000000000000061";
const classId = "66a000000000000000000062";
let server;
let baseUrl;
let originalFindUser;
let originalSessionExists;
let originalSubmissionFind;
let originalSubmissionFindOne;
let originalSessionDeleteMany;
let originalUserFindOne;
let originalAuthTokenFindOne;
let originalAuthTokenDeleteMany;
let originalUserUpdateOne;
let originalClassFindOne;
let originalAssignmentFind;
let originalTodoAggregate;
let currentUser;
let token;

before(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ sub: studentId, jti: "phase-six-test-session" }, secret);
  originalFindUser = User.findById;
  originalSessionExists = Session.exists;
  originalSubmissionFind = AssignmentSubmission.find;
  originalSubmissionFindOne = AssignmentSubmission.findOne;
  originalSessionDeleteMany = Session.deleteMany;
  originalUserFindOne = User.findOne;
  originalAuthTokenFindOne = AuthToken.findOne;
  originalAuthTokenDeleteMany = AuthToken.deleteMany;
  originalUserUpdateOne = User.updateOne;
  originalClassFindOne = Class.findOne;
  originalAssignmentFind = Assignment.find;
  originalTodoAggregate = Todo.aggregate;
  currentUser = {
    id: studentId,
    _id: studentId,
    email: "student@example.com",
    emailVerified: true,
    role: "STUDENT",
    accountType: "class",
    classId,
    notificationPreferences: { inApp: true, email: false, browser: false },
    aiAlwaysAllowActions: []
  };
  User.findById = () => ({ select: async () => currentUser });
  Session.exists = async () => ({ _id: "phase-six-test-session" });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findById = originalFindUser;
  Session.exists = originalSessionExists;
  AssignmentSubmission.find = originalSubmissionFind;
  AssignmentSubmission.findOne = originalSubmissionFindOne;
  Session.deleteMany = originalSessionDeleteMany;
  User.findOne = originalUserFindOne;
  AuthToken.findOne = originalAuthTokenFindOne;
  AuthToken.deleteMany = originalAuthTokenDeleteMany;
  User.updateOne = originalUserUpdateOne;
  Class.findOne = originalClassFindOne;
  Assignment.find = originalAssignmentFind;
  Todo.aggregate = originalTodoAggregate;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function authHeaders(extra = {}) {
  return { Cookie: `token=${token}`, ...extra };
}

test("settings is private and does not disclose credential fields", async () => {
  const response = await fetch(`${baseUrl}/api/settings`, { headers: authHeaders() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.settings.email, currentUser.email);
  assert.equal("password" in body.settings, false);
  assert.equal("emailVerified" in body.settings, false);
});

test("class assignments are queried only for the authenticated student's class and account", async () => {
  let filter;
  AssignmentSubmission.find = (query) => {
    filter = query;
    return {
      populate() { return this; },
      sort() { return this; },
      lean: async () => []
    };
  };
  const response = await fetch(`${baseUrl}/api/classroom/assignments`, { headers: authHeaders() });
  assert.equal(response.status, 200);
  assert.deepEqual(filter, { studentId, classId });
  assert.deepEqual((await response.json()).assignments, []);
});

test("assignment submission lookup cannot target another student's submission", async () => {
  let filter;
  AssignmentSubmission.findOne = async (query) => {
    filter = query;
    return null;
  };
  const response = await fetch(`${baseUrl}/api/classroom/assignments/66a000000000000000000063/submit`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ response: "My work" })
  });
  assert.equal(response.status, 404);
  assert.deepEqual(filter, {
    assignmentId: "66a000000000000000000063",
    studentId,
    classId
  });
});

test("students cannot read class analytics", async () => {
  const response = await fetch(`${baseUrl}/api/classroom/analytics`, { headers: authHeaders() });
  assert.equal(response.status, 403);
});

test("teacher analytics use class assignments only, never private personal todos", async () => {
  const teacherId = "66a000000000000000000064";
  const assignmentId = "66a000000000000000000065";
  const oldDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let assignmentFilter;
  let submissionFilter;
  let personalTodosTouched = false;
  currentUser = { ...currentUser, id: teacherId, _id: teacherId, role: "TEACHER_ADMIN", accountType: "personal", classId: null };
  Class.findOne = (filter) => {
    assert.deepEqual(filter, { teacherId });
    return { select: () => ({ lean: async () => ({ _id: classId, name: "Class A" }) }) };
  };
  Assignment.find = (filter) => {
    assignmentFilter = filter;
    return { select: () => ({ lean: async () => [{ _id: assignmentId, dueDate: oldDueDate }] }) };
  };
  AssignmentSubmission.find = (filter) => {
    submissionFilter = filter;
    return { select: () => ({ lean: async () => [
      { assignmentId, submittedAt: new Date() },
      { assignmentId, submittedAt: null }
    ] }) };
  };
  Todo.aggregate = () => {
    personalTodosTouched = true;
    throw new Error("Class analytics must not query todos.");
  };
  const response = await fetch(`${baseUrl}/api/classroom/analytics`, { headers: authHeaders() });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(assignmentFilter, { classId });
  assert.deepEqual(submissionFilter, { classId });
  assert.equal(body.totalAssignments, 1);
  assert.equal(body.completionPercentage, 50);
  assert.equal(body.overdue, 1);
  assert.equal(personalTodosTouched, false);
  currentUser = { ...currentUser, id: studentId, _id: studentId, role: "STUDENT", accountType: "class", classId };
});

test("personal accounts cannot read class announcements", async () => {
  currentUser = { ...currentUser, accountType: "personal", classId: null };
  const response = await fetch(`${baseUrl}/api/classroom/announcements`, { headers: authHeaders() });
  assert.equal(response.status, 403);
  currentUser = { ...currentUser, accountType: "class", classId };
});

test("Phase 6 APIs require a valid server-issued session", async () => {
  const legacyToken = jwt.sign({ sub: studentId }, secret);
  const response = await fetch(`${baseUrl}/api/settings`, { headers: { Cookie: `token=${legacyToken}` } });
  assert.equal(response.status, 401);
});

test("unverified users cannot log in with otherwise-valid credentials", async () => {
  const password = await bcrypt.hash("password123", 4);
  User.findOne = () => ({
    select() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({
        _id: studentId,
        id: studentId,
        email: "student@example.com",
        emailVerified: false,
        password,
        role: "STUDENT",
        accountType: "class",
        setupComplete: true,
        classId
      }).then(resolve, reject);
    }
  });
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student@example.com", password: "password123" })
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /Verify your email/);
  User.findOne = originalUserFindOne;
});

test("logout from other devices revokes only sessions owned by the current account", async () => {
  let filter;
  Session.deleteMany = async (query) => {
    filter = query;
    return { deletedCount: 2 };
  };
  const response = await fetch(`${baseUrl}/api/auth/logout-others`, {
    method: "POST",
    headers: authHeaders()
  });
  assert.equal(response.status, 200);
  assert.deepEqual(filter, { userId: studentId, tokenId: { $ne: "phase-six-test-session" } });
  assert.equal((await response.json()).revoked, 2);
});

test("registration reports unavailable email delivery before creating an account", async () => {
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpFrom = process.env.SMTP_FROM;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "new@example.com", password: "password123" })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /Configure SMTP/);
  if (originalSmtpHost === undefined) delete process.env.SMTP_HOST;
  else process.env.SMTP_HOST = originalSmtpHost;
  if (originalSmtpFrom === undefined) delete process.env.SMTP_FROM;
  else process.env.SMTP_FROM = originalSmtpFrom;
});

test("verification link preview does not consume the one-time token", async () => {
  const response = await fetch(`${baseUrl}/api/auth/verify-email?token=${"a".repeat(64)}`);
  assert.equal(response.status, 404);
});

test("email verification is completed explicitly from the confirmation page", async () => {
  let tokenFilter;
  let userUpdate;
  let tokenCleanup;
  AuthToken.findOne = async (filter) => {
    tokenFilter = filter;
    return { userId: studentId };
  };
  User.updateOne = async (filter, update) => { userUpdate = { filter, update }; };
  AuthToken.deleteMany = async (filter) => { tokenCleanup = filter; };
  const response = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "a".repeat(64) })
  });
  assert.equal(response.status, 200);
  assert.equal(tokenFilter.purpose, "verify_email");
  assert.equal(userUpdate.update.$set.emailVerified, true);
  assert.deepEqual(tokenCleanup, { userId: studentId, purpose: "verify_email" });
});
