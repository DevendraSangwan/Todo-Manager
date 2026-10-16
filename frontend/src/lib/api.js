export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const result = response.status === 204
    ? {}
    : contentType.includes("application/json")
      ? await response.json()
      : {};
  if (!response.ok) {
    const error = new Error(result.message ?? `The server returned an error (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (!contentType.includes("application/json") && response.status !== 204) {
    throw new Error("The server returned an invalid response.");
  }
  return result;
}
