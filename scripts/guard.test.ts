import assert from "node:assert/strict";
import { test } from "node:test";

import { shrinkProblem } from "./guard.ts";

test("a first snapshot, or one about the same size, is fine", () => {
  assert.equal(shrinkProblem(undefined, 5000), undefined);
  assert.equal(shrinkProblem(20000, 19000), undefined);
  assert.equal(shrinkProblem(20000, 10000), undefined);
});

test("a fetched copy under half the previous snapshot's size is refused", () => {
  assert.match(shrinkProblem(20149, 1) ?? "", /1 characters.*20149/);
  assert.match(shrinkProblem(20000, 9999) ?? "", /half/);
});
