export function parseBearerToken(value: string | string[] | undefined): string | null {
  const authorization = Array.isArray(value) ? value[0] : value;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}
