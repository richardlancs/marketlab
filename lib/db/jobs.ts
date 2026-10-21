/**
 * A record of scheduled-job runs (job_run), so /api/health can tell whether
 * the daily job ran recently and cleanly. Old rows are trimmed as new ones
 * are written.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
const { jobRun } = schema;
const KEEP_DAYS = 30;

export interface JobRecord {
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  summary: unknown;
}

export function createJobRepository(db: Db) {
  return {
    async record(name: string, run: JobRecord): Promise<void> {
      await db.batch([
        db.insert(jobRun).values({ name, startedAt: run.startedAt, finishedAt: run.finishedAt, ok: run.ok, summary: JSON.stringify(run.summary ?? null) }),
        db.delete(jobRun).where(and(eq(jobRun.name, name), lt(jobRun.startedAt, run.startedAt - KEEP_DAYS * 86_400_000))),
      ]);
    },

    /** The most recent run of `name`, or null if it has never run. */
    async latest(name: string): Promise<JobRecord | null> {
      const [row] = await db.select().from(jobRun).where(eq(jobRun.name, name)).orderBy(desc(jobRun.startedAt)).limit(1);
      if (!row) return null;
      let summary: unknown = null;
      try {
        summary = JSON.parse(row.summary);
      } catch {
        summary = row.summary;
      }
      return { startedAt: row.startedAt, finishedAt: row.finishedAt, ok: row.ok, summary };
    },
  };
}
