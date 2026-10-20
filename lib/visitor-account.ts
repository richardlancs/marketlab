import "server-only";
import { getMarket } from "./market";
import { startingAccount } from "./starting-account";
import type { Account } from "./trading";

/**
 * The starting account for a visitor who has saved nothing yet (no guest, no
 * account), as of the market's latest close so it needs no catching up.
 * It's only shown; it's saved on their first change.
 */
export async function visitorAccount(): Promise<Account> {
  return { ...startingAccount(), processedThrough: (await getMarket()).asOf };
}
