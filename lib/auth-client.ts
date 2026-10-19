/**
 * The browser side of Better Auth: functions that call /api/auth/… and a
 * useSession() hook. Safe to import in Client Components; it holds no secrets.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
