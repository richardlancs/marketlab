/**
 * Push notifications in the database: which devices each person gets them
 * on, and which triggered alerts are due to be pushed. An alert is pushed
 * once (pushed_at), only if it triggered recently and hasn't been seen in
 * the app yet. Guests can have devices too; handover (lib/db/guests.ts)
 * moves them to the account.
 */
import { and, asc, count, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { DeviceSubscription, PushAlert } from "../push";
import * as schema from "./schema";
import type { Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { priceAlert, pushSubscription } = schema;

export interface DuePush {
  userId: string;
  alerts: PushAlert[];
  devices: DeviceSubscription[];
}

/** Moves a guest's devices to the account they signed in to. For use inside a transaction. */
export async function moveDevices(ex: Executor, fromUserId: string, toUserId: string) {
  await ex.update(pushSubscription).set({ userId: toUserId }).where(eq(pushSubscription.userId, fromUserId));
}

export async function deleteDevicesOf(ex: Executor, userId: string) {
  await ex.delete(pushSubscription).where(eq(pushSubscription.userId, userId));
}

export function createPushRepository(db: Db) {
  return {
    /**
     * Stores (or refreshes) a device for `userId`. An endpoint belongs to one
     * browser, so if someone else had it (another account signed in on the
     * same browser before), it's theirs no longer. Past `max` devices, the
     * oldest go.
     */
    async add(userId: string, device: DeviceSubscription, max: number, now = Date.now()): Promise<void> {
      await db
        .insert(pushSubscription)
        .values({ ...device, userId, createdAt: now })
        .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId, p256dh: device.p256dh, auth: device.auth, createdAt: now } });
      const [{ n }] = await db.select({ n: count() }).from(pushSubscription).where(eq(pushSubscription.userId, userId));
      if (n > max) {
        const oldest = await db.select({ endpoint: pushSubscription.endpoint }).from(pushSubscription).where(eq(pushSubscription.userId, userId)).orderBy(asc(pushSubscription.createdAt)).limit(n - max);
        await this.remove(oldest.map((d) => d.endpoint));
      }
    },

    /** The device, if it's `userId`'s, with when it was set up. */
    async get(userId: string, endpoint: string): Promise<(DeviceSubscription & { createdAt: number }) | null> {
      const [row] = await db
        .select({ endpoint: pushSubscription.endpoint, p256dh: pushSubscription.p256dh, auth: pushSubscription.auth, createdAt: pushSubscription.createdAt })
        .from(pushSubscription)
        .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
      return row ?? null;
    },

    async removeFor(userId: string, endpoint: string): Promise<void> {
      await db.delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
    },

    /** Deletes devices the push service says are gone. */
    async remove(endpoints: string[]): Promise<void> {
      if (endpoints.length) await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, endpoints));
    },

    async markSent(endpoints: string[], at = Date.now()): Promise<void> {
      if (endpoints.length) await db.update(pushSubscription).set({ lastSentAt: at }).where(inArray(pushSubscription.endpoint, endpoints));
    },

    /**
     * Pushes to send: per person with at least one device, their unseen
     * alerts that triggered since `since` and haven't been pushed. At most
     * `limit` people.
     */
    async due(since: number, limit: number): Promise<DuePush[]> {
      const rows = await db
        .selectDistinct({
          userId: priceAlert.userId,
          id: priceAlert.id,
          symbol: priceAlert.symbol,
          direction: priceAlert.direction,
          price: priceAlert.price,
          condition: priceAlert.condition,
          triggeredAt: priceAlert.triggeredAt,
          triggerPrice: priceAlert.triggerPrice,
        })
        .from(priceAlert)
        .innerJoin(pushSubscription, eq(pushSubscription.userId, priceAlert.userId))
        .where(and(isNotNull(priceAlert.triggeredAt), gte(priceAlert.triggeredAt, since), isNull(priceAlert.pushedAt), eq(priceAlert.seen, false)))
        .orderBy(priceAlert.userId, priceAlert.triggeredAt);
      const byUser = new Map<string, DuePush>();
      for (const r of rows) {
        let due = byUser.get(r.userId);
        if (!due) {
          if (byUser.size >= limit) break;
          byUser.set(r.userId, (due = { userId: r.userId, alerts: [], devices: [] }));
        }
        due.alerts.push({ id: r.id, symbol: r.symbol, direction: r.direction, price: r.price, condition: r.condition ?? undefined, triggerPrice: r.triggerPrice ?? undefined });
      }
      if (byUser.size) {
        const devices = await db.select().from(pushSubscription).where(inArray(pushSubscription.userId, [...byUser.keys()]));
        for (const d of devices) byUser.get(d.userId)?.devices.push({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth });
      }
      return [...byUser.values()];
    },

    async markPushed(userId: string, alertIds: string[], at = Date.now()): Promise<void> {
      if (alertIds.length) await db.update(priceAlert).set({ pushedAt: at }).where(and(eq(priceAlert.userId, userId), inArray(priceAlert.id, alertIds)));
    },
  };
}

export type PushRepository = ReturnType<typeof createPushRepository>;
