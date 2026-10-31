import Image from "next/image";
import { isOwnAvatar } from "@/lib/profile";

/**
 * A person's profile picture in a circle, or the first letter of their name
 * on the brand gradient when they have none. Only a picture this site serves
 * (lib/profile.ts isOwnAvatar) is ever shown, never an address from elsewhere.
 * Decorative: the name is always given next to it or in a label.
 */
export function Avatar({ name, image, size = 36, className = "" }: { name: string; image?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (isOwnAvatar(image)) {
    return (
      // unoptimized: the picture is private (sent only with the owner's cookie), so the image optimizer can't fetch it, and it's already small.
      <Image src={image} alt="" unoptimized width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={style} />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-start to-brand-end font-semibold text-white ${className}`}
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
