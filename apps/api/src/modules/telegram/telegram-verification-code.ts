import { timingSafeEqual } from "node:crypto";

export function matchesTelegramVerificationCode(expected: string, provided: string): boolean {
  if (!/^\d{6}$/.test(expected) || !/^\d{6}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(provided, "ascii"));
}
