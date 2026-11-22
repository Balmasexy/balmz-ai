import test from "node:test";
import assert from "node:assert/strict";
import { isSafeNeonRuntimeRole } from "../lib/neon-runtime-role.js";

const limitedLoginRole = {
  rolcanlogin: true,
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  is_neon_superuser_member: false,
};

test("accepts a login role without elevated Neon/Postgres privileges", () => {
  assert.equal(isSafeNeonRuntimeRole(limitedLoginRole), true);
});

test("rejects missing roles and roles without LOGIN", () => {
  assert.equal(isSafeNeonRuntimeRole(undefined), false);
  assert.equal(isSafeNeonRuntimeRole(null), false);
  assert.equal(isSafeNeonRuntimeRole({ ...limitedLoginRole, rolcanlogin: false }), false);
});

for (const privilege of ["rolsuper", "rolcreaterole", "rolcreatedb", "rolreplication", "rolbypassrls", "is_neon_superuser_member"]) {
  test("rejects elevated runtime role privilege: " + privilege, () => {
    assert.equal(isSafeNeonRuntimeRole({ ...limitedLoginRole, [privilege]: true }), false);
  });
}
