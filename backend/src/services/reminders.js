import ReminderDelivery from "../models/ReminderDelivery.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "./email.js";

export async function processReminders() {
  const users = await User.find({
    reminderMinutes: { $gt: 0 },
    $or: [
      { "notificationPreferences.email": true },
      { "notificationPreferences.inApp": true }
    ]
  }).select("_id email reminderMinutes notificationPreferences timezone").lean();
  const now = new Date();

  for (const user of users) {
    const windowStart = new Date(now.getTime() + user.reminderMinutes * 60_000);
    const windowEnd = new Date(windowStart.getTime() + 60_000);
    const todos = await Todo.find({
      userId: user._id,
      status: "pending",
      deletedAt: null,
      dueDate: { $gte: windowStart, $lt: windowEnd }
    }).select("_id title dueDate").lean();

    for (const todo of todos) {
      if (user.notificationPreferences.inApp) {
        const delivery = await reserveDelivery(user._id, todo, "in_app");
        if (delivery) {
          try {
            await Notification.create({
              senderId: user._id,
              recipientId: user._id,
              message: `Reminder: “${todo.title}” is due soon.`
            });
          } catch (error) {
            await ReminderDelivery.deleteOne({ _id: delivery._id });
            throw error;
          }
        }
      }
      if (user.notificationPreferences.email) {
        const delivery = await reserveDelivery(user._id, todo, "email");
        if (delivery) {
          try {
            await sendEmail({
              to: user.email,
              subject: "A Daymark task is due soon",
              text: `Your task “${todo.title}” is due at ${new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: user.timezone || "UTC"
              }).format(todo.dueDate)}.`
            });
          } catch (error) {
            await ReminderDelivery.deleteOne({ _id: delivery._id });
            console.error("Reminder email delivery failed:", error.message);
          }
        }
      }
    }
  }
}

async function reserveDelivery(userId, todo, channel) {
  try {
    return await ReminderDelivery.create({
      userId,
      todoId: todo._id,
      dueDate: todo.dueDate,
      channel
    });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}
