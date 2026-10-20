import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import DailyProductivity from "../src/models/DailyProductivity.js";
import Todo from "../src/models/Todo.js";
import User from "../src/models/User.js";
import { updateDailyProductivity } from "../src/utils/productivity.js";

const secret = "phase-four-test-secret-with-at-least-32-characters";
const studentId = "66a000000000000000000011";
let server;
let baseUrl;
let originalFindUser;
let token;

before(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ sub: studentId }, secret);
  originalFindUser = User.findById;
  User.findById = () => ({
    select: async () => ({
      id: studentId,
      _id: studentId,
      email: "student@example.com",
      role: "STUDENT",
      accountType: "personal",
      classId: null,
      leaderboardOptIn: false
    })
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findById = originalFindUser;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("personal users cannot access the class leaderboard", async () => {
  const response = await fetch(`${baseUrl}/api/productivity/leaderboard`, {
    headers: { Cookie: `token=${token}` }
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: "The class leaderboard is available only to class members." });
});

test("focus session input is validated before any todo is accessed", async () => {
  const response = await fetch(`${baseUrl}/api/productivity/focus-sessions`, {
    method: "POST",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ todoId: "invalid", type: "focus", minutes: 25 })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "Select a todo and provide a valid session duration." });
});

test("focus preferences reject durations outside supported ranges", async () => {
  const response = await fetch(`${baseUrl}/api/productivity/profile`, {
    method: "PATCH",
    headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      focusSettings: { focusMinutes: 0, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 }
    })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "Provide valid leaderboard or focus preferences." });
});

test("daily streak qualifies at 80 percent and carries forward the prior streak", async () => {
  const originals = {
    countDocuments: Todo.countDocuments,
    findOne: DailyProductivity.findOne,
    findOneAndUpdate: DailyProductivity.findOneAndUpdate,
    updateOne: User.updateOne
  };
  const today = new Date().toISOString().slice(0, 10);
  const priorDate = new Date(`${today}T00:00:00.000Z`);
  priorDate.setUTCDate(priorDate.getUTCDate() - 1);
  const yesterday = priorDate.toISOString().slice(0, 10);
  let completedCount = 4;
  let userUpdate;

  try {
    Todo.countDocuments = async (filter) => filter.status === "completed" ? completedCount : 5;
    DailyProductivity.findOne = (filter) => ({
      lean: async () => filter.date === yesterday ? { date: yesterday, qualified: true, streak: 4 } : null
    });
    DailyProductivity.findOneAndUpdate = async (filter, update) => ({ date: filter.date, ...update.$set });
    User.updateOne = async (_filter, update) => { userUpdate = update; };

    const qualified = await updateDailyProductivity(studentId, today);
    assert.equal(qualified.qualified, true);
    assert.equal(qualified.streak, 5);
    assert.equal(userUpdate.$max.bestStreak, 5);

    completedCount = 3;
    const unqualified = await updateDailyProductivity(studentId, today);
    assert.equal(unqualified.qualified, false);
    assert.equal(unqualified.streak, 0);
  } finally {
    Todo.countDocuments = originals.countDocuments;
    DailyProductivity.findOne = originals.findOne;
    DailyProductivity.findOneAndUpdate = originals.findOneAndUpdate;
    User.updateOne = originals.updateOne;
  }
});
