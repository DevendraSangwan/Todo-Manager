import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { isConfiguredSuperAdmin } from "../utils/roles.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Please log in to continue." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    let user = await User.findById(payload.sub).select("_id email role accountType setupComplete classId");
    if (!user) {
      return res.status(401).json({ message: "Your session is no longer valid." });
    }

    if (isConfiguredSuperAdmin(user.email) &&
        (user.role !== "SUPER_ADMIN" || user.accountType !== "personal" || !user.setupComplete)) {
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: { role: "SUPER_ADMIN", accountType: "personal", setupComplete: true, classId: null } },
        { new: true, runValidators: true }
      ).select("_id email role accountType setupComplete classId");
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Please log in to continue." });
    }
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
    return next();
  };
}
