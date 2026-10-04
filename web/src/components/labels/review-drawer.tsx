"use client";

import { LABEL_NAMES } from "@quard/shared";
import { useState } from "react";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { DrawerActions, DrawerSection } from "@/components/kit/detail/drawer-parts";
import { TextLink } from "@/components/kit/links";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Select } from "@/components/ui/select";
import type { ReviewChunk } from "@/lib/data/content-labels/types";
import { formatLongDate, formatShare } from "@/lib/format";
import { FallbackValue, LabelName } from "./label-name";

type ReviewDrawerProps = {
    open: boolean;
    // Kept after closing so the content stays while the drawer wipes out
    chunk: ReviewChunk | null;
    busy: boolean;
    onSave: (label: string) => void;
    onClose: () => void;
};

// The label to approve: the fallback's when it gave one, else the detector's
export function suggestedLabel(chunk: ReviewChunk): string {
    return chunk.fallback?.label ?? chunk.label;
}

// The fixed labels, plus a new one the fallback suggested
export function labelOptions(chunk: ReviewChunk) {
    const names: string[] = [...LABEL_NAMES];
    const suggested = suggestedLabel(chunk);
    return (names.includes(suggested) ? names : [...names, suggested]).map((name) => ({ value: name, label: name }));
}

function ReviewForm({ chunk, busy, onSave, onClose }: Omit<ReviewDrawerProps, "open"> & { chunk: ReviewChunk }) {
    const suggested = suggestedLabel(chunk);
    const [label, setLabel] = useState(suggested);
    const approving = label === suggested;
    return (
        <>
            <p className="mt-5 max-h-[280px] overflow-y-auto rounded-md bg-recess p-[14px] text-[13px] leading-[1.6] whitespace-pre-wrap text-ink wrap-anywhere">
                {chunk.text}
            </p>
            <DrawerSection title="Labels">
                <DetailList>
                    {chunk.chances.map((chance) => (
                        <DetailRow key={chance.label} term={<LabelName label={chance.label} />} mono>
                            {formatShare(chance.chance)}
                        </DetailRow>
                    ))}
                    <DetailRow term="AI fallback">
                        <FallbackValue fallback={chunk.fallback} />
                        {chunk.fallback?.reason ? (
                            <span className="block text-[12px] text-ink-muted">{chunk.fallback.reason}</span>
                        ) : null}
                    </DetailRow>
                </DetailList>
            </DrawerSection>
            <DrawerSection title="Where it came from">
                <DetailList>
                    <DetailRow term="Origin" mono>
                        {chunk.origin}
                    </DetailRow>
                    <DetailRow term="Tool" mono>
                        {chunk.tool}
                    </DetailRow>
                    <DetailRow term="Agent">{chunk.agent}</DetailRow>
                    <DetailRow term="Run">
                        <TextLink href={`/runs/${chunk.runId}`} mono>
                            {chunk.runId.slice(0, 12)}
                        </TextLink>
                    </DetailRow>
                    <DetailRow term="Seen">{formatLongDate(chunk.at)}</DetailRow>
                </DetailList>
            </DrawerSection>
            <DrawerSection title="Right label">
                <Select options={labelOptions(chunk)} value={label} onValueChange={setLabel} aria-label="Right label" />
            </DrawerSection>
            <DrawerActions
                cancel={
                    <Button variant="link" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                }
            >
                <Button variant="default" busy={busy} onClick={() => onSave(label)}>
                    {busy ? "Saving…" : approving ? `Approve ${label}` : `Correct to ${label}`}
                </Button>
            </DrawerActions>
        </>
    );
}

// Shows a chunk in full, so a person can approve its label or pick the right one
export function ReviewDrawer({ open, chunk, busy, onSave, onClose }: ReviewDrawerProps) {
    return (
        <Drawer open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)} title="Review label">
            {chunk ? (
                <ReviewForm key={chunk.eventId} chunk={chunk} busy={busy} onSave={onSave} onClose={onClose} />
            ) : null}
        </Drawer>
    );
}
