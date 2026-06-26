import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_BYTE_LENGTH = 64;
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_HASH_VERSION = "1";

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64url");
    const derivedKey = (await scrypt(password, salt, HASH_BYTE_LENGTH)) as Buffer;

    return [
      PASSWORD_HASH_PREFIX,
      PASSWORD_HASH_VERSION,
      salt,
      derivedKey.toString("base64url")
    ].join("$");
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const [prefix, version, salt, storedHash] = passwordHash.split("$");

    if (
      prefix !== PASSWORD_HASH_PREFIX ||
      version !== PASSWORD_HASH_VERSION ||
      !salt ||
      !storedHash
    ) {
      return false;
    }

    const storedKey = Buffer.from(storedHash, "base64url");
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  }
}
