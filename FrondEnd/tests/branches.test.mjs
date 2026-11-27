import { test } from "node:test";
import assert from "node:assert/strict";
import { branchKey, chooseBranch } from "../src/branches/branchSelection.js";

test("no branches opens registration", () => {
  assert.deepEqual(chooseBranch([]), { page: "createBranch", activeShopId: null });
});
test("one existing branch opens management, even with a stale saved ID", () => {
  assert.deepEqual(chooseBranch([{ id: 7 }], 999), { page: "manage", activeShopId: 7 });
});
test("a new login with multiple branches requires a choice", () => {
  assert.deepEqual(chooseBranch([{ id: 7 }, { id: 8 }]), { page: "branches", activeShopId: null });
});
test("session reload may restore an owned branch", () => {
  assert.deepEqual(chooseBranch([{ id: 7 }, { id: 8 }], "8"), { page: "manage", activeShopId: 8 });
});
test("an ID from another account cannot become the active branch", () => {
  assert.deepEqual(chooseBranch([{ id: 7 }, { id: 8 }], 99), { page: "branches", activeShopId: null });
  assert.notEqual(branchKey(1), branchKey(2));
});
