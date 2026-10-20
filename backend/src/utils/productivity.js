import DailyProductivity from "../models/DailyProductivity.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";

export async function updateDailyProductivity(userId, date) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const [totalTasks, completedTasks] = await Promise.all([
    Todo.countDocuments({ userId, deletedAt: null, dueDate: { $gte: start, $lt: end } }),
    Todo.countDocuments({ userId, deletedAt: null, status: "completed", dueDate: { $gte: start, $lt: end } })
  ]);
  const qualified = totalTasks > 0 && completedTasks / totalTasks >= 0.8;
  const previousDate = new Date(start);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const yesterday = previousDate.toISOString().slice(0, 10);
  const previous = await DailyProductivity.findOne({ userId, date: yesterday, qualified: true }).lean();
  const existing = await DailyProductivity.findOne({ userId, date }).lean();
  const streak = qualified ? (previous?.streak ?? 0) + 1 : 0;
  const record = await DailyProductivity.findOneAndUpdate(
    { userId, date },
    { $set: { totalTasks, completedTasks, qualified, streak } },
    { new: true, upsert: true, runValidators: true }
  );

  const today = new Date().toISOString().slice(0, 10);
  if (qualified && date <= today && (!existing || date >= existing.date)) {
    await User.updateOne(
      { _id: userId, $or: [{ lastStreakDate: null }, { lastStreakDate: { $lte: date } }] },
      { $set: { currentStreak: streak, lastStreakDate: date }, $max: { bestStreak: streak } }
    );
  } else if (!qualified && existing?.qualified) {
    await User.updateOne(
      { _id: userId, lastStreakDate: date },
      { $set: { currentStreak: previous?.streak ?? 0, lastStreakDate: previous?.date ?? null } }
    );
  }
  return record;
}
