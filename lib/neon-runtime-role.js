/**
 * Return true only for a login role that is suitable for application runtime use.
 * Neon Console/API-created roles normally inherit neon_superuser and are rejected.
 * @param {{
 *   rolcanlogin?: boolean,
 *   rolsuper?: boolean,
 *   rolcreaterole?: boolean,
 *   rolcreatedb?: boolean,
 *   rolreplication?: boolean,
 *   rolbypassrls?: boolean,
 *   is_neon_superuser_member?: boolean
 * } | null | undefined} role
 */
export function isSafeNeonRuntimeRole(role) {
  return Boolean(
    role &&
    role.rolcanlogin === true &&
    role.rolsuper !== true &&
    role.rolcreaterole !== true &&
    role.rolcreatedb !== true &&
    role.rolreplication !== true &&
    role.rolbypassrls !== true &&
    role.is_neon_superuser_member !== true
  );
}
