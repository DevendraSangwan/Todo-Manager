export function isConfiguredSuperAdmin(email) {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
