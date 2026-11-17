export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-tr from-accent/20 via-accent/10 to-transparent text-accent shadow-sm border border-accent/20"
      style={{ width: size, height: size }}
      aria-label="Athena AI Logo"
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C17.523 22 22 17.523 22 12C22 6.477 17.523 2 12 2Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeDasharray="2 2"
        />
        <path
          d="M12 6.5C12 9.538 14.462 12 17.5 12C14.462 12 12 14.462 12 17.5C12 14.462 9.538 12 6.5 12C9.538 12 12 9.538 12 6.5Z"
          fill="currentColor"
        />
        <circle cx="12" cy="12" r="1.5" fill="white" />
      </svg>
    </span>
  );
}
