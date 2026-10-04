"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TableState } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { showToast } from "@/components/ui/toast";
import { reviewLabel } from "@/lib/data/content-labels/actions";
import type { ReviewChunk } from "@/lib/data/content-labels/types";
import { QueueTable } from "./queue-table";
import { ReviewDrawer } from "./review-drawer";

type ReviewQueueProps = { queue: ReviewChunk[]; open: number; now: number };

// The chunks to review. Saving a label takes the chunk off the list.
export function ReviewQueue({ queue, open, now }: ReviewQueueProps) {
    const router = useRouter();
    // Chunks reviewed here, hidden until the page's data catches up
    const [done, setDone] = useState<string[]>([]);
    const [picked, setPicked] = useState<ReviewChunk | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const rows = queue.filter((row) => !done.includes(row.eventId));

    function pick(row: ReviewChunk) {
        setPicked(row);
        setDrawerOpen(true);
    }

    async function save(label: string) {
        if (!picked) return;
        const chunk = picked;
        setBusy(true);
        let saved: boolean;
        try {
            saved = await reviewLabel(chunk.eventId, label);
        } catch {
            setBusy(false);
            showToast("Could not save the label", "review-label");
            return;
        }
        setDone((list) => [...list, chunk.eventId]);
        setBusy(false);
        setDrawerOpen(false);
        showToast(saved ? `Saved as ${label}` : "That chunk is gone", "review-label");
        router.refresh();
    }

    return (
        <section aria-label="To review">
            <SectionHeading title="To review" count={Math.max(0, open - done.length)} />
            <QueueTable rows={rows} now={now} onReview={pick} />
            {rows.length === 0 ? <TableState title="Nothing to review" /> : null}
            <ReviewDrawer
                open={drawerOpen}
                chunk={picked}
                busy={busy}
                onSave={save}
                onClose={() => setDrawerOpen(false)}
            />
        </section>
    );
}
