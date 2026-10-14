const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
let csrfToken = "";

export async function prepareApi() {
  const result = await request("/auth/csrf");
  csrfToken = result.token;
}

export async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken)
    headers["X-CSRF-Token"] = csrfToken;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      headers,
      credentials: "include",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "Cannot reach the restaurant API. Start Apache and MySQL, then try again.",
    );
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 502) {
    throw new Error(
      "The PHP API is unreachable. Install/start Apache in XAMPP, then try again.",
    );
  }
  if (!response.ok)
    throw new Error(
      result.error?.message || `Request failed (${response.status}).`,
    );
  return result.data;
}
