import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import Todo from "../src/models/Todo.js";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";

const secret = "phase-five-test-secret-with-at-least-32-characters";
const userId = "66a000000000000000000051";
let server;
let baseUrl;
let originalFindUser;
let originalGeminiKey;
let originalSessionExists;
let token;
let aiDataPermission = true;

before(async () => {
  process.env.JWT_SECRET = secret;
  originalGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  token = jwt.sign({ sub: userId, jti: "ai-test-session" }, secret);
  originalFindUser = User.findById;
  originalSessionExists = Session.exists;
  Session.exists = async () => ({ _id: "ai-test-session" });
  User.findById = () => ({
    select: async () => ({
      id: userId,
      _id: userId,
      email: "student@example.com",
      role: "STUDENT",
      accountType: "personal",
      classId: null,
      aiDataPermission,
      aiAlwaysAllowActions: []
    })
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findById = originalFindUser;
  Session.exists = originalSessionExists;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("AI preferences require an authenticated session", async () => {
  const response = await fetch(`${baseUrl}/api/ai/settings`);
  assert.equal(response.status, 401);
});

test("AI settings expose only the predefined action allowlist", async () => {
  const response = await fetch(`${baseUrl}/api/ai/settings`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    configured: false,
    alwaysAllowActions: [],
    allowedActions: ["add_todo", "move_todo"]
  });
});

test("AI APIs honor the user's AI data permission", async () => {
  aiDataPermission = false;
  const response = await fetch(`${baseUrl}/api/ai/settings`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 403);
  aiDataPermission = true;
});

test("AI permissions reject actions outside the predefined allowlist", async () => {
  const response = await fetch(`${baseUrl}/api/ai/settings`, {
    method: "PATCH",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ alwaysAllowActions: ["delete_todo"] })
  });
  assert.equal(response.status, 400);
});

test("AI generation endpoints explain when the backend key is missing", async () => {
  const response = await fetch(`${baseUrl}/api/ai/suggestions`, {
    method: "POST",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /Gemini API key/);
});

test("AI generation reports an unavailable provider without making a request", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_API_KEY;
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "  " })
  });
  assert.equal(response.status, 503);
});

test("AI task breakdown looks up only todos owned by the signed-in user", async () => {
  const originalFindOne = Todo.findOne;
  let query;
  process.env.GEMINI_API_KEY = "test-key";
  Todo.findOne = (filter) => {
    query = filter;
    return { select: () => ({ lean: async () => null }) };
  };
  try {
    const response = await fetch(`${baseUrl}/api/ai/break-into-steps/66a000000000000000000052`, {
      method: "POST",
      headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 404);
    assert.equal(String(query.userId), userId);
  } finally {
    Todo.findOne = originalFindOne;
    delete process.env.GEMINI_API_KEY;
  }
});
