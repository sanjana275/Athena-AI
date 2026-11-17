/* eslint-disable @next/next/no-img-element */
export function Avatar({ name, picture, size = 32 }: { name: string; picture?: string | null; size?: number }) {
  const initials = (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return picture ? (
    <img src={picture} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex items-center justify-center rounded-full bg-accent text-xs font-semibold text-white" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}
