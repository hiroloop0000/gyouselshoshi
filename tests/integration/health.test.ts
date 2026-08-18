import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";

describe("Worker API", () => {
  it("returns a structured health response", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: "gyosei-pass" });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not leak stack traces for missing routes", async () => {
    const response = await app.request("/api/not-a-route");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
