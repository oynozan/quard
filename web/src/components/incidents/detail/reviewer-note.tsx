import { EmptyLine } from "@/components/kit/empty";
import { SectionHeading } from "@/components/kit/headings";
import { Pane } from "@/components/kit/pane";
import type { ReviewerNote as Note } from "@/lib/data/incidents/types";
import { formatClock } from "@/lib/format";
import { formatCost } from "../lib/labels";
import { ReviewerText } from "./reviewer-text";

// The AI reviewer's plain-words explanation. It explains the verdict and never decides it.
export function ReviewerNote({ note }: { note: Note | null }) {
    return (
        <section aria-label="AI reviewer">
            <SectionHeading title="AI explanation" />
            {note ? (
                <Pane title="AI reviewer" tag="not the verdict">
                    <div className="flex flex-col gap-3 p-3 text-[13px] leading-[1.6] text-ink-2">
                        <ReviewerText paragraphs={note.paragraphs} />
                        <p
                            className="mono text-[11px] text-ink-muted"
                            title={`Written at ${formatClock(note.writtenAt)} UTC with your provider key`}
                        >
                            {note.model} · {formatCost(note.costUsd)} · {formatClock(note.writtenAt)} UTC
                        </p>
                    </div>
                </Pane>
            ) : (
                <EmptyLine>No explanation yet</EmptyLine>
            )}
        </section>
    );
}
