// The one list of account roles. Everything that cares about roles (validation, types, the admin panel's
// pickers) reads it from here, and the database has the same list as the `user_role` enum.
//
// To add a role later (for example "chef" and "consultant"):
//   1. add it here, in ROLES (and a label in ROLE_LABELS);
//   2. add it to the database:   alter type public.user_role add value 'chef';
//      (see supabase/migrations/20261001000200_roles.sql, which explains the one-line migration);
//   3. decide what it may do: write its Row Level Security policies and, if the app should treat it differently,
//      check `user.role` where it matters. `admin` is the only role with special powers today.
// Nothing else needs to change: the Zod schema, the TypeScript type and the role picker follow this list.

export const ROLES = ['user', 'admin'] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  user: 'User',
  admin: 'Administrator',
}

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value)
