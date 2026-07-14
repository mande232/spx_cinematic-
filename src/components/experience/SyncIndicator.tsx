type SyncIndicatorProps = {
  online: boolean;
  synced: boolean;
};

export function SyncIndicator({ online, synced }: SyncIndicatorProps) {
  const label = !online ? "Offline" : synced ? "Synced" : "Syncing";
  const color = !online ? "bg-destructive" : synced ? "bg-green-500" : "bg-yellow-400 animate-soft-pulse";

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1">
      <div className={`size-1.5 rounded-full ${color}`} />
      <span className="font-mono text-[8px] uppercase tracking-widest text-foreground dark:text-muted-foreground">{label}</span>
    </div>
  );
}
