import { PHONE_STEPS } from "@/lib/session-utils";

type ExperienceProgressProps = {
  activeIndex: number;
};

export function ExperienceProgress({ activeIndex }: ExperienceProgressProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-1">
        {PHONE_STEPS.map((step, index) => {
          const isActive = index === activeIndex;
          const isComplete = index < activeIndex;
          return (
            <div key={step.id} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`flex size-6 items-center justify-center rounded-full border text-[9px] font-mono transition-colors ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isComplete
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-background/50 text-muted-foreground"
                }`}
              >
                {isComplete ? "✓" : step.id}
              </div>
              <span
                className={`hidden text-[8px] font-mono uppercase tracking-wider sm:block ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${((activeIndex + 1) / PHONE_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
