"use client";

import { useAccount } from "./account-provider";

/** The small line above page titles saying where the account is saved. */
export function StorageLabel({ prefix }: { prefix?: string }) {
  const { mode } = useAccount();
  const where = mode === "signed-in" ? "Saved to your account" : mode === "guest" ? "Saved in this browser" : " "; // nbsp keeps the line's height while loading
  return (
    <p className="text-sm font-medium text-accent">
      {prefix && mode !== "loading" ? `${prefix} · ${where.charAt(0).toLowerCase()}${where.slice(1)}` : where}
    </p>
  );
}
