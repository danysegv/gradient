import { test } from "node:test";
import assert from "node:assert/strict";

// lib/clip-auth.ts caches its parsed curator list at module scope (by
// design — "parsed once"), and getCurators() is only invoked lazily, from
// inside resolveCurator/sessionCurator/expectedSessionToken — not at
// import time. So each test that needs a different CLIP_CURATORS/
// CLIP_GATE_SECRET value must (a) set process.env, (b) import a fresh
// module instance via a cache-busting query param, and (c) call it —
// all three before touching process.env again. Every test sets both keys
// explicitly (undefined = deleted) rather than trying to save/restore, so
// there's nothing left over for the next test to trip on.
let importCounter = 0;

function setEnv(env: { CLIP_CURATORS?: string; CLIP_GATE_SECRET?: string }) {
  if (env.CLIP_CURATORS === undefined) delete process.env.CLIP_CURATORS;
  else process.env.CLIP_CURATORS = env.CLIP_CURATORS;
  if (env.CLIP_GATE_SECRET === undefined) delete process.env.CLIP_GATE_SECRET;
  else process.env.CLIP_GATE_SECRET = env.CLIP_GATE_SECRET;
}

async function freshClipAuth(env: {
  CLIP_CURATORS?: string;
  CLIP_GATE_SECRET?: string;
}) {
  setEnv(env);
  importCounter++;
  return import(`./clip-auth.ts?test=${importCounter}`);
}

test("resolveCurator matches the right curator and rejects a wrong password", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a,bob:secret-b" });
  assert.equal(mod.resolveCurator("secret-a"), "alice");
  assert.equal(mod.resolveCurator("secret-b"), "bob");
  assert.equal(mod.resolveCurator("nope"), null);
});

test("resolveCurator matches a curator regardless of position in the list", async () => {
  // Guards against an implementation that only checks the first entry.
  const mod = await freshClipAuth({
    CLIP_CURATORS: "alice:secret-a,bob:secret-b,carol:secret-c",
  });
  assert.equal(mod.resolveCurator("secret-c"), "carol");
});

test("session token round-trips: issued for a name, validates back to that name", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a,bob:secret-b" });
  const token = mod.expectedSessionToken("alice");
  assert.equal(mod.sessionCurator(token), "alice");
  assert.equal(mod.isValidSessionToken(token), true);
});

test("a tampered token (wrong hash) does not validate", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a,bob:secret-b" });
  const token = mod.expectedSessionToken("alice");
  const [name] = token.split(".");
  assert.equal(mod.sessionCurator(`${name}.deadbeef`), null);
});

test("swapping the name on a valid token invalidates it (name is bound into the hash)", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a,bob:secret-b" });
  const aliceToken = mod.expectedSessionToken("alice");
  const [, hash] = aliceToken.split(".");
  // Claim to be bob using alice's hash — must not validate as either.
  assert.equal(mod.sessionCurator(`bob.${hash}`), null);
});

test("an unknown curator name in the token does not validate", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a" });
  assert.equal(mod.sessionCurator("mallory.deadbeef"), null);
});

test("rotating one curator's secret does not sign the other out", async () => {
  // Issue sessions for both curators under the original secrets.
  const before = await freshClipAuth({ CLIP_CURATORS: "alice:secret-a,bob:secret-b" });
  const aliceToken = before.expectedSessionToken("alice");
  const bobToken = before.expectedSessionToken("bob");

  // Rotate alice's secret only. Bob's is unchanged.
  const after = await freshClipAuth({
    CLIP_CURATORS: "alice:rotated-secret,bob:secret-b",
  });

  assert.equal(
    after.sessionCurator(aliceToken),
    null,
    "alice's old session should be invalidated by rotation"
  );
  assert.equal(
    after.sessionCurator(bobToken),
    "bob",
    "bob's session must survive alice's rotation"
  );

  // And alice can log back in with her new secret.
  assert.equal(after.resolveCurator("rotated-secret"), "alice");
});

test("CLIP_GATE_SECRET still works as a fallback when CLIP_CURATORS is unset", async () => {
  const mod = await freshClipAuth({ CLIP_GATE_SECRET: "legacy-secret" });
  const name = mod.resolveCurator("legacy-secret");
  assert.ok(name, "fallback secret should resolve to a curator name");
  const token = mod.expectedSessionToken(name);
  assert.equal(mod.sessionCurator(token), name);
});

test("throws when neither CLIP_CURATORS nor CLIP_GATE_SECRET is set", async () => {
  const mod = await freshClipAuth({});
  assert.throws(() => mod.resolveCurator("anything"));
});

test("throws on a malformed CLIP_CURATORS entry", async () => {
  const mod = await freshClipAuth({ CLIP_CURATORS: "alice-missing-colon" });
  assert.throws(() => mod.resolveCurator("anything"));
});
