import { Link } from "react-router";

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2" aria-label="ServiceFlow home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0E6B4C" />
        <path
          d="M9 20.5c1.6 1.4 3.9 2.2 6.4 2.2 3.8 0 6.1-1.8 6.1-4.4 0-2.4-1.7-3.5-5.2-4.2l-1.6-.3c-1.8-.4-2.5-.9-2.5-1.8 0-1 1-1.7 2.8-1.7 1.7 0 3.1.6 4.3 1.6"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="23" cy="9.5" r="2" fill="#E0A526" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-ink-900"}`}>
        ServiceFlow
      </span>
    </Link>
  );
}
