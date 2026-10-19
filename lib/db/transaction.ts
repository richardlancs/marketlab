/**
 * Write transactions, one at a time per database within this server process.
 *
 * Local SQLite needs this because its driver is synchronous: a transaction
 * waiting for the file's write lock would block the whole event loop,
 * including the transaction that holds the lock, so the two would wait for
 * each other until the timeout. Queueing them here avoids that. (Turso queues
 * transactions on its side, so this costs nothing there.) Every repository
 * shares one queue per database, so their writes can't collide either.
 */
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
export type Executor = Pick<Db, "select" | "insert" | "update" | "delete">;

const queues = new WeakMap<Db, Promise<unknown>>();

export function writeTransaction<T>(db: Db, fn: (tx: Executor) => Promise<T>): Promise<T> {
  // "immediate" takes the write lock at the start, so reads inside the
  // transaction can't go stale before its writes.
  const run = (queues.get(db) ?? Promise.resolve()).then(() => db.transaction(fn, { behavior: "immediate" }));
  queues.set(
    db,
    run.catch(() => {}), // one failed transaction mustn't block the next
  );
  return run;
}
