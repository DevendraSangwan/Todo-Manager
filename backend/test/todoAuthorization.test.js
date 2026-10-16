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
let token;

before(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ sub: studentId }, secret);
  originalFindUser = User.findById;
  originalFindTodo = Todo.findById;
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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("a student cannot read another user's private todo", async () => {
  const response = await fetch(`${baseUrl}/api/todos/${todoId}`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: "You cannot read this todo." });
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
