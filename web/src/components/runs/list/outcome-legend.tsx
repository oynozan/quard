import { StatusSquare } from "@/components/kit/labels";

const ITEMS = [
    { tone: "context", word: "Allowed" },
    { tone: "warning", word: "Asked" },
    { tone: "danger", word: "Blocked" },
] as const;

// The key for the guard decision bars, read once for the whole table.
export function OutcomeLegend() {
    return (
        <ul aria-label="Guard decision colors" className="flex items-center gap-3 text-[12px] text-ink-muted">
            {ITEMS.map((item) => (
                <li key={item.word} className="inline-flex items-center gap-2">
                    <StatusSquare tone={item.tone} />
                    {item.word}
                </li>
            ))}
        </ul>
    );
}
