// src/hooks/useRole.js
export function useRole() {
  try {
    const raw = localStorage.getItem("adminInfo");
    const user = raw ? JSON.parse(raw) : null;
    return user?.role || "guest";
  } catch {
    return "guest";
  }
}
