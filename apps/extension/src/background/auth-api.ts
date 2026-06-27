import type {
  ExtensionAuthResponse,
  ExtensionCurrentUser,
  ExtensionLoginInput,
  ExtensionRegisterInput,
  ExtensionStoredAuthSession
} from "../shared/types/auth.js";
import { apiRequest } from "./api-request.js";
import { clearAuthSession, getStoredAuthSession, saveAuthSession } from "./auth-session.js";
import { shouldClearExtensionSessionOn401 } from "../shared/web-auth-sync-policy.js";

export async function loginWithApi(input: ExtensionLoginInput): Promise<ExtensionAuthResponse> {
  const response = await apiRequest<ExtensionAuthResponse>({
    body: input,
    method: "POST",
    path: "/auth/login"
  });

  if (!response.ok) {
    throw new Error(response.errorMessage);
  }

  return response.data;
}

export async function registerWithApi(
  input: ExtensionRegisterInput
): Promise<ExtensionAuthResponse> {
  const response = await apiRequest<ExtensionAuthResponse>({
    body: input,
    method: "POST",
    path: "/auth/register"
  });

  if (!response.ok) {
    throw new Error(response.errorMessage);
  }

  return response.data;
}

export async function getCurrentUserWithApi(accessToken: string): Promise<ExtensionCurrentUser> {
  const response = await apiRequest<ExtensionCurrentUser>({
    accessToken,
    method: "GET",
    path: "/auth/me"
  });

  if (!response.ok) {
    throw new Error(response.errorMessage);
  }

  return response.data;
}

export async function authenticatedApiRequest<TData = unknown>(options: {
  accessToken?: string;
  body?: unknown;
  clearSessionOnUnauthorized?: boolean;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
}): Promise<{ data: TData; status: number }> {
  const accessToken = options.accessToken ?? (await getStoredAuthSession())?.accessToken;

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await apiRequest<TData>({
    accessToken,
    path: options.path,
    ...(options.method === undefined ? {} : { method: options.method }),
    ...(options.body === undefined ? {} : { body: options.body })
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      shouldClearExtensionSessionOn401({
        ...(options.clearSessionOnUnauthorized === undefined
          ? {}
          : { clearSessionOnUnauthorized: options.clearSessionOnUnauthorized }),
        ...(options.method === undefined ? {} : { method: options.method })
      })
    ) {
      await clearAuthSession();
    }

    throw new Error(response.errorMessage);
  }

  return {
    data: response.data,
    status: response.status
  };
}

export async function persistAuthResponse(
  authResponse: ExtensionAuthResponse
): Promise<ExtensionStoredAuthSession> {
  return saveAuthSession(authResponse);
}
