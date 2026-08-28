/**
 * A success-or-failure value, so an operation that can fail says so in its
 * type instead of throwing.
 *
 * Import uses this to keep a malformed record an ordinary outcome: the entity
 * returns a reason, the caller collects it, and one bad record cannot abort a
 * batch of 420.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
