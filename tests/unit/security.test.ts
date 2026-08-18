import { describe, expect, it } from "vitest";
import {
  hashPassword,
  PASSWORD_HASH_ALGORITHM,
  PASSWORD_HASH_TOTAL_ITERATIONS,
  verifyPassword,
} from "../../src/worker/security";

describe("password protection", () => {
  it("preserves the intended work factor while respecting workerd's per-operation limit", async () => {
    const password = "correct-horse-battery-staple";
    const protectedPassword = await hashPassword(password);

    expect(protectedPassword.iterations).toBe(PASSWORD_HASH_TOTAL_ITERATIONS);
    expect(protectedPassword.algorithm).toBe(PASSWORD_HASH_ALGORITHM);
    await expect(
      verifyPassword(password, protectedPassword.hash, protectedPassword.salt, protectedPassword.iterations, protectedPassword.algorithm),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("different-password", protectedPassword.hash, protectedPassword.salt, protectedPassword.iterations, protectedPassword.algorithm),
    ).resolves.toBe(false);
  });

  it("rejects invalid work factors", async () => {
    await expect(hashPassword("correct-horse-battery-staple", undefined, 0)).rejects.toThrow("PASSWORD_ITERATIONS_INVALID");
  });
});
