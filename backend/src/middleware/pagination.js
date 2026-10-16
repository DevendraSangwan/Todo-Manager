export function parsePagination(req, res) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    return null;
  }
  return { page, limit, skip: (page - 1) * limit };
}
