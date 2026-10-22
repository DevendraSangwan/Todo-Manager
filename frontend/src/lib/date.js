function timezone() {
  return localStorage.getItem("daymark-timezone") ||
    document.documentElement.dataset.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatUserDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: timezone()
  }).format(new Date(value));
}

export function formatUserDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone()
  }).format(new Date(value));
}
