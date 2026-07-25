import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";

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
