import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCron } from "./cron-auth.ts";

const req = (auth?: string) => new Request("https://x/api/market/run", { headers: auth ? { authorization: auth } : {} });

test("no secret configured: nobody runs the job", () => {
  delete process.env.CRON_SECRET;
  assert.deepEqual(checkCron(req("Bearer anything")), { ok: false, status: 503, error: "CRON_SECRET is not set." });
});

test("only the exact bearer secret runs it", () => {
  process.env.CRON_SECRET = "s3cret";
  assert.equal(checkCron(req("Bearer s3cret")).ok, true);
  assert.equal(checkCron(req("Bearer nope")).ok, false);
  assert.equal(checkCron(req()).ok, false);
  delete process.env.CRON_SECRET;
});
