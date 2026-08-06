import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";

/** Custom event name dispatched on window when a user logs in (same-tab safe). */
export const LOGIN_EVENT = "postlap:login";

/**
 * Store the auth token and dispatch a same-tab login event so any listener
 * in the same tab (e.g. HamzawiChat) can react immediately.
 * Use this instead of raw localStorage.setItem for the token.
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new CustomEvent(LOGIN_EVENT));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function handleAuthError(res: Response): boolean {
  if (res.status === 401) {
    clearAuth();
    return true;
  }
  return false;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser<T>(): T | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; }
}
