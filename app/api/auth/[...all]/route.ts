import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Every Better Auth request (sign up, sign in, sign out, session) goes to
// /api/auth/…; this catch-all route hands them all to Better Auth.
export const { GET, POST } = toNextJsHandler(auth);
