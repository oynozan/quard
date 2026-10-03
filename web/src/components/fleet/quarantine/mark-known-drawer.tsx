"use client";

import { DrawerActions, DrawerSection, IdentifierRow } from "@/components/kit/detail/drawer-parts";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { CautionBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { formatInt, formatLongDate } from "@/lib/format";
import { KIND_NAMES } from "./value-cell";

type MarkKnownDrawerProps = {
    open: boolean;
    // Kept after closing so the content stays while the drawer wipes out
    value: QuarantinedValue | null;
    busy: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

// Confirms that a quarantined value is known, which lifts the fleet-wide block
export function MarkKnownDrawer({ open, value, busy, onConfirm, onClose }: MarkKnownDrawerProps) {
    return (
        <Drawer open={open} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)} title="Mark as known">
            {value ? (
                <>
                    <IdentifierRow value={value.hash} />
                    <DrawerSection title="Quarantined value">
                        <DetailList>
                            <DetailRow term={KIND_NAMES[value.kind]} mono>
                                {value.value}
                            </DetailRow>
                            <DetailRow term="Field" mono>
                                {value.field}
                            </DetailRow>
                            <DetailRow term="Agents">{value.agents.join(", ")}</DetailRow>
                            <DetailRow term="First seen">{formatLongDate(value.firstSeenAt)}</DetailRow>
                            <DetailRow term="Quarantined">{formatLongDate(value.quarantinedAt)}</DetailRow>
                            <DetailRow term="Runs that used it" mono>
                                {formatInt(value.runs)}
                            </DetailRow>
                            <DetailRow term="Blocked attempts" mono>
                                {formatInt(value.blockedAttempts)}
                            </DetailRow>
                            <DetailRow term="Last attempt">{formatLongDate(value.lastAttemptAt)}</DetailRow>
                        </DetailList>
                    </DrawerSection>
                    <CautionBox className="mt-7">
                        Unblocks this value fleet-wide. Every other guard still checks it.
                    </CautionBox>
                    <DrawerActions
                        cancel={
                            <Button variant="link" onClick={onClose} disabled={busy}>
                                Cancel
                            </Button>
                        }
                    >
                        <Button variant="default" busy={busy} onClick={onConfirm}>
                            {busy ? "Marking as known…" : "Mark as known"}
                        </Button>
                    </DrawerActions>
                </>
            ) : null}
        </Drawer>
    );
}
