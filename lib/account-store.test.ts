// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeAccount, encodeAccount } from "./account-store";
import { startingAccount } from "./starting-account";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "TSLA", "META", "NFLX"];
const isKnown = (s: string) => SYMBOLS.includes(s);

describe("decodeAccount", () => {
  it("round-trips an account", () => {
    expect(decodeAccount(encodeAccount(startingAccount()), isKnown)).toEqual(startingAccount());
  });

  it.each([
    ["nothing saved", null],
    ["not JSON", "{oops"],
    ["another version", JSON.stringify({ version: 99, account: startingAccount() })],
    ["an invalid account", JSON.stringify({ version: 1, account: { cash: "lots" } })],
  ])("returns null for %s", (_, raw) => {
    expect(decodeAccount(raw, isKnown)).toBeNull();
  });
});

it("keeps an account holding a stock outside the core list (by default only the format is checked)", () => {
  const withKo = { ...startingAccount(), holdings: [{ symbol: "KO", shares: 3, averageCost: 60 }], watchlist: ["KO", "BRK-B"] };
  expect(decodeAccount(encodeAccount(withKo))).toEqual(withKo);
  expect(decodeAccount(encodeAccount({ ...withKo, watchlist: ["not a symbol"] }))).toBeNull();
});
