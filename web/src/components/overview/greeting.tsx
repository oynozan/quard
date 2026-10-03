import { cn } from "@/lib/utils";

// The overview's page title
export function Greeting({ text, className }: { text: string; className?: string }) {
    return (
        <h1
            className={cn(
                "text-[27px] leading-[1.25] font-extralight tracking-[-0.2px] text-ink-bright max-[1250px]:text-[25px] max-[760px]:max-w-[18ch]",
                className,
            )}
        >
            {text}
        </h1>
    );
}
