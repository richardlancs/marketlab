/** The account pages' form styles, matching the sign-in form (components/auth/auth-form.tsx). */
export const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none transition-colors focus-visible:border-accent disabled:opacity-60";
export const labelClass = "block text-sm font-medium";
const button = "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
export const primaryButton = `${button} bg-accent-fill text-white hover:opacity-90`;
export const secondaryButton = `${button} border border-border bg-surface-raised hover:bg-foreground/5`;
export const dangerButton = `${button} bg-loss-fill text-white hover:opacity-90`;
