import { apiRequest } from "../../../lib/api/api-client";
import type { AuthResponse, LoginInput, RegisterInput } from "../types/auth";

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    body: input,
    method: "POST"
  });
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    body: input,
    method: "POST"
  });
}
