"use client";

import { useSyncExternalStore } from "react";
import { readProgress, serverProgress, subscribeProgress } from "@/lib/lessons/progress";

/** The lessons whose tests this browser has passed, kept in sync across tabs. */
export const useProgress = () => useSyncExternalStore(subscribeProgress, readProgress, serverProgress);
