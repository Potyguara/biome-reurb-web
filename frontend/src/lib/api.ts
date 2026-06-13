import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

export function getStoredToken() {
  if (typeof window === "undefined") return null;

  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("biome_reurb_token")
  );
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem("access_token", token);
  localStorage.setItem("token", token);
  localStorage.setItem("biome_reurb_token", token);
}

export function clearToken() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("biome_reurb_token");
}

export function clearStoredTokens() {
  clearToken();
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : "";

    if (
      status === 401 &&
      typeof window !== "undefined" &&
      currentPath !== "/login" &&
      !currentPath.startsWith("/consulta-reurb")
    ) {
      clearToken();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);