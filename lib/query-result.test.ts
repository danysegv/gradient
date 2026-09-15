import { test } from "node:test";
import assert from "node:assert/strict";
import { loaded, LIBRARY_UNAVAILABLE } from "./query-result.ts";

test("a successful empty result is empty, not failed", () => {
  assert.deepEqual(loaded("t", { data: [], error: null }), {
    rows: [],
    failed: false,
  });
});

test("a null data with no error is empty, not failed", () => {
  // PostgREST returns null data for some shapes; absence is not an error.
  assert.deepEqual(loaded("t", { data: null, error: null }), {
    rows: [],
    failed: false,
  });
});

test("a failed result is flagged and yields no rows", () => {
  const err = console.error;
  console.error = () => {};
  try {
    const r = loaded("t", { data: [{ id: 1 }], error: { message: "502" } });
    assert.equal(r.failed, true);
    // Rows are dropped even though data was present: a result carrying an
    // error is not a partial answer to be half-trusted.
    assert.deepEqual(r.rows, []);
  } finally {
    console.error = err;
  }
});

test("the unavailable copy does not claim the library is empty", () => {
  assert.equal(/no clips|empty shelf.$|nothing here/i.test(LIBRARY_UNAVAILABLE), false);
  assert.match(LIBRARY_UNAVAILABLE, /connection problem/);
});
