import type { SpxTheme } from "@/hooks/use-spx-theme";

export function ThemeToggle({
  theme,
  onToggle,
  className = "",
}: {
  theme: SpxTheme;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`rounded-full border border-border bg-background px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${className}`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
