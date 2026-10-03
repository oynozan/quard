import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FieldProps = {
    label: ReactNode;
    // The id of the control inside, so the label points at it
    htmlFor?: string;
    children: ReactNode;
    // A hint attached under the field
    hint?: ReactNode;
    hintTone?: HintTone;
    // A problem sentence, checked on blur, that replaces the hint
    problem?: ReactNode;
    // A live mono preview of the final identifier
    preview?: ReactNode;
    help?: ReactNode;
    className?: string;
};

// One form stack entry with the label 9px above the control and 18px before the next label
export function Field({ label, htmlFor, children, hint, hintTone, problem, preview, help, className }: FieldProps) {
    return (
        <div className={cn(help ? "mb-5" : "mb-[18px]", className)}>
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {preview ? <FieldPreview>{preview}</FieldPreview> : null}
            {problem ? (
                <FieldHint tone="problem" role="status">
                    {problem}
                </FieldHint>
            ) : hint ? (
                <FieldHint tone={hintTone}>{hint}</FieldHint>
            ) : null}
            {help ? <HelpText>{help}</HelpText> : null}
        </div>
    );
}

type HintTone = "muted" | "positive" | "problem";

const HINT_TONE: Record<HintTone, string> = {
    muted: "text-ink-muted",
    positive: "text-ink-link",
    problem: "text-problem",
};

// A hint 8px under its field, where a positive hint may set one word in weight 600
export function FieldHint({
    tone = "muted",
    role,
    children,
}: {
    tone?: HintTone;
    role?: "status";
    children: ReactNode;
}) {
    return (
        <p role={role} className={cn("mt-2 text-[12px] leading-[1.7]", HINT_TONE[tone])}>
            {children}
        </p>
    );
}

// Help text 14px under a field
export function HelpText({ children, className }: { children: ReactNode; className?: string }) {
    return <p className={cn("mt-[14px] text-[12px] leading-[1.8] text-ink-muted", className)}>{children}</p>;
}

// The identifier a field will produce, previewed in mono under the input
export function FieldPreview({ children }: { children: ReactNode }) {
    return <p className="mono mt-2 text-[12px] text-ink-faint wrap-anywhere">{children}</p>;
}
