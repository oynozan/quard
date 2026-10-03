import { cn } from "@/lib/utils";

// The 13px three-quarter ring takes the label color, so it is dark inside a green button
export function Spinner({ size = 13, className }: { size?: number; className?: string }) {
    return <span aria-hidden className={cn("spinner", className)} style={{ width: size, height: size }} />;
}

// Four green dots pulsing left to right, for a wait with no known end
export function FadeDots({ label = "Loading…", className }: { label?: string; className?: string }) {
    return (
        <span role="status" aria-label={label} className={cn("inline-flex h-[22px] items-center gap-1", className)}>
            {[0, 1, 2, 3].map((i) => (
                <span
                    key={i}
                    aria-hidden
                    className="fade-dot size-1 rounded-full bg-signal"
                    style={{ animationDelay: `${i * 200}ms` }}
                />
            ))}
        </span>
    );
}
