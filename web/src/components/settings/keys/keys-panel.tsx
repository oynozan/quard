"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, TableState } from "@/components/kit/data-table";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import type { AgentKey, CreateKeyResult, RevokeKeyResult } from "@/lib/data/settings";
import { LiveNote, PanelIntro } from "../shared/panel-intro";
import { Cols, Head } from "../shared/table-parts";
import { KEY_HEADERS, KEY_MIN_WIDTH, KEY_WIDTHS } from "./columns";
import { KeyDrawer } from "./key-drawer";
import { KeyRow } from "./key-row";

type KeysPanelProps = {
    // From the page, which reads them again after each change
    keys: AgentKey[];
    now: number;
    createAction: (name: string) => Promise<CreateKeyResult>;
    revokeAction: (id: string) => Promise<RevokeKeyResult>;
};

const REVOKE_FAILED = "Could not revoke the key. Try again.";

// Active keys first, newest first, then revoked keys
function ordered(keys: AgentKey[]): AgentKey[] {
    return [...keys].sort((a, b) => {
        if ((a.revokedAt === null) !== (b.revokedAt === null)) return a.revokedAt === null ? -1 : 1;
        return b.createdAt - a.createdAt;
    });
}

export function KeysPanel({ keys, now, createAction, revokeAction }: KeysPanelProps) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [fresh, setFresh] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const rows = ordered(keys);
    const active = keys.filter((key) => key.revokedAt === null);

    async function revoke(item: AgentKey): Promise<boolean> {
        const result = await revokeAction(item.id).catch((): RevokeKeyResult => ({ error: REVOKE_FAILED }));
        if ("error" in result) {
            setProblem(result.error);
            return false;
        }
        setProblem(null);
        setFresh(item.id);
        setNote(`Key ${item.name} revoked. Agents using it are refused from now on.`);
        return true;
    }

    return (
        <section aria-label="Agent keys">
            <PanelIntro
                action={
                    <Button onClick={() => setOpen(true)}>
                        <Plus size={16} strokeWidth={0.75} />
                        Create key
                    </Button>
                }
            >
                Keys the SDK uses to send events.
            </PanelIntro>
            {problem ? <ErrorBox className="mt-0 mb-[22px]">{problem}</ErrorBox> : null}

            <DataTable minWidth={KEY_MIN_WIDTH} className="text-[14px]">
                <caption className="sr-only">
                    Agent keys: {active.length} active, {keys.length - active.length} revoked
                </caption>
                <Cols widths={KEY_WIDTHS} />
                <Head
                    first="Key"
                    rest={[
                        ...KEY_HEADERS,
                        <span key="actions" className="sr-only">
                            Actions
                        </span>,
                    ]}
                />
                <tbody>
                    {rows.map((item) => (
                        <KeyRow
                            key={item.id}
                            item={item}
                            now={now}
                            fresh={fresh === item.id}
                            onRevoke={() => revoke(item)}
                        />
                    ))}
                </tbody>
            </DataTable>
            {rows.length === 0 ? (
                <TableState
                    title="No agent keys yet"
                    body="One key per app that runs agents."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            Create key
                        </Button>
                    }
                />
            ) : null}

            <LiveNote message={note} />
            <KeyDrawer
                open={open}
                onOpenChange={setOpen}
                takenNames={active.map((key) => key.name)}
                createAction={createAction}
                onCreated={(name) => setNote(`Key ${name} created.`)}
            />
        </section>
    );
}
