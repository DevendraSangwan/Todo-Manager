import mongoose from "mongoose";

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }
  const dbName = process.env.MONGODB_DB_NAME ?? "Todo_manager";
  await mongoose.connect(uri, { dbName });
  console.info(`Connected to MongoDB database "${dbName}"`);
}
