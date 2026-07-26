import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_ENCODING_PATTERN =
  /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const match = SCRYPT_ENCODING_PATTERN.exec(encoded);
  if (!match) {
    return false;
  }

  const [, saltHex, expectedHex] = match;
  const expected = Buffer.from(expectedHex, "hex");
  try {
    const actual = (await scrypt(
      password,
      Buffer.from(saltHex, "hex"),
      KEY_LENGTH,
    )) as Buffer;
    return timingSafeEqual(expected, actual);
  } catch {
    // A corrupt stored credential must deny authentication, not turn into a
    // route-level exception.
    return false;
  }
}
