import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Todo from "../src/models/Todo.js";
import User from "../src/models/User.js";

const secret = "phase-two-test-secret-with-at-least-32-characters";
const studentId = "66a000000000000000000001";
const ownerId = "66a000000000000000000002";
const todoId = "66a000000000000000000003";
const privateTodo = {
  _id: todoId,
  userId: ownerId,
  classId: null,
  title: "Private todo",
  visibility: "private",
  status: "pending"
};
let server;
let baseUrl;
let originalFindUser;
let originalFindTodo;
let originalAggregate;
let originalCountDocuments;
let token;

before(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ sub: studentId }, secret);
  originalFindUser = User.findById;
  originalFindTodo = Todo.findById;
  originalAggregate = Todo.aggregate;
  originalCountDocuments = Todo.countDocuments;
  User.findById = () => ({
    select: async () => ({
      id: studentId,
      _id: studentId,
      email: "student@example.com",
      role: "STUDENT",
      accountType: "personal",
      classId: null
    })
  });
  Todo.findById = () => ({
    ...privateTodo,
    lean: async () => privateTodo
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findById = originalFindUser;
  Todo.findById = originalFindTodo;
  Todo.aggregate = originalAggregate;
  Todo.countDocuments = originalCountDocuments;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("a student cannot read another user's private todo", async () => {
  const response = await fetch(`${baseUrl}/api/todos/${todoId}`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: "You cannot read this todo." });
});

test("shared todos do not expose personal productivity fields", async () => {
  const sharedTodo = {
    ...privateTodo,
    visibility: "public",
    estimatedMinutes: 45,
    actualMinutes: 25,
    xpAwarded: true,
    categoryId: "66a000000000000000000005",
    dependencies: ["66a000000000000000000006"]
  };
  Todo.findById = () => ({ ...sharedTodo, lean: async () => sharedTodo });
  const response = await fetch(`${baseUrl}/api/todos/${todoId}`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 200);
  const { todo } = await response.json();
  assert.equal(todo.visibility, "public");
  assert.equal("estimatedMinutes" in todo, false);
  assert.equal("actualMinutes" in todo, false);
  assert.equal("xpAwarded" in todo, false);
  assert.equal("categoryId" in todo, false);
  assert.equal("dependencies" in todo, false);
});

test("a student cannot edit another user's private todo", async () => {
  const response = await fetch(`${baseUrl}/api/todos/${todoId}`, {
    method: "PATCH",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Changed by another student" })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: "You cannot edit this todo." });
});

test("a todo cannot be completed before its prerequisite", async () => {
  Todo.findById = () => ({
    ...privateTodo,
    userId: studentId,
    dependencies: ["66a000000000000000000004"],
    deletedAt: null,
    save: async () => {}
  });
  Todo.countDocuments = async () => 0;
  const response = await fetch(`${baseUrl}/api/todos/${todoId}`, {
    method: "PATCH",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed" })
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: "Complete this todo’s prerequisites before marking it complete."
  });
});

test("daily report includes totals, completion percentage, and chart values", async () => {
  Todo.aggregate = async () => [
    { _id: "completed", count: 2 },
    { _id: "pending", count: 1 }
  ];
  const response = await fetch(`${baseUrl}/api/todos/reports/daily?date=2026-10-16`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    date: "2026-10-16",
    total: 3,
    completed: 2,
    pending: 1,
    completionPercentage: 67,
    chart: [{ name: "Completed", count: 2 }, { name: "Pending", count: 1 }]
  });
  Todo.aggregate = originalAggregate;
});

test("todo filters reject legacy priority values", async () => {
  const response = await fetch(`${baseUrl}/api/todos?priority=high`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "Priority is not valid." });
});

test("students cannot access the teacher audit trail", async () => {
  const response = await fetch(`${baseUrl}/api/teacher-audit/mine`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 403);
});
