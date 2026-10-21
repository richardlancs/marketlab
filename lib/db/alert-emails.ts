/**
 * Alert emails in the database: who has turned them on, and which triggered
 * alerts are due to be emailed. An alert is emailed once (emailed_at), only
 * to a signed-in user with a confirmed address and alert emails on, and only
 * if they haven't already seen it in the app.
 */
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { AlertCondition } from "../trading";
import * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
const { emailPreference, priceAlert, user } = schema;

export interface DueAlert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  price: number;
  condition: AlertCondition | null;
  triggeredAt: number;
  triggerPrice: number | null;
}

export interface DueDigest {
  userId: string;
  email: string;
  name: string;
  alerts: DueAlert[];
}

export function createAlertEmailRepository(db: Db) {
  return {
    async enabled(userId: string): Promise<boolean> {
      const [row] = await db.select({ on: emailPreference.alertEmails }).from(emailPreference).where(eq(emailPreference.userId, userId));
      return row?.on ?? false;
    },

    async setEnabled(userId: string, on: boolean, now = Date.now()): Promise<void> {
      await db
        .insert(emailPreference)
        .values({ userId, alertEmails: on, updatedAt: now })
        .onConflictDoUpdate({ target: emailPreference.userId, set: { alertEmails: on, updatedAt: now } });
    },

    /**
     * Digests to send: per user, their unseen alerts that triggered since
     * `since` and haven't been emailed, for users with alert emails on, a
     * confirmed address and a real account. At most `limit` users.
     */
    async due(since: number, limit: number): Promise<DueDigest[]> {
      const rows = await db
        .select({
          userId: user.id,
          email: user.email,
          name: user.name,
          id: priceAlert.id,
          symbol: priceAlert.symbol,
          direction: priceAlert.direction,
          price: priceAlert.price,
          condition: priceAlert.condition,
          triggeredAt: priceAlert.triggeredAt,
          triggerPrice: priceAlert.triggerPrice,
        })
        .from(priceAlert)
        .innerJoin(user, eq(user.id, priceAlert.userId))
        .innerJoin(emailPreference, eq(emailPreference.userId, priceAlert.userId))
        .where(
          and(
            eq(emailPreference.alertEmails, true),
            eq(user.emailVerified, true),
            eq(user.isGuest, false),
            isNotNull(priceAlert.triggeredAt),
            gte(priceAlert.triggeredAt, since),
            isNull(priceAlert.emailedAt),
            eq(priceAlert.seen, false),
          ),
        )
        .orderBy(user.id, priceAlert.triggeredAt);
      const byUser = new Map<string, DueDigest>();
      for (const r of rows) {
        let digest = byUser.get(r.userId);
        if (!digest) {
          if (byUser.size >= limit) break;
          byUser.set(r.userId, (digest = { userId: r.userId, email: r.email, name: r.name, alerts: [] }));
        }
        digest.alerts.push({ id: r.id, symbol: r.symbol, direction: r.direction, price: r.price, condition: r.condition ?? null, triggeredAt: r.triggeredAt as number, triggerPrice: r.triggerPrice });
      }
      return [...byUser.values()];
    },

    async markEmailed(userId: string, alertIds: string[], at = Date.now()): Promise<void> {
      if (alertIds.length) await db.update(priceAlert).set({ emailedAt: at }).where(and(eq(priceAlert.userId, userId), inArray(priceAlert.id, alertIds)));
    },
  };
}
