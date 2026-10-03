"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable, TableState } from "@/components/kit/data-table";
import { Button } from "@/components/ui/button";
import type { AgentKey } from "@/lib/data/settings";
import { LiveNote, PanelIntro } from "../shared/panel-intro";
import { Cols, Head } from "../shared/table-parts";
import { KeyDrawer } from "./key-drawer";
import { KeyRow } from "./key-row";

type KeysPanelProps = {
    keys: AgentKey[];
    agents: string[];
    account: string;
    now: number;
};

const WIDTHS = ["22%", "20%", "15%", "8%", "10%", "10%", "15%"];

// Active keys first, newest first, then revoked keys
function ordered(keys: AgentKey[]): AgentKey[] {
    return [...keys].sort((a, b) => {
        if ((a.revokedAt === null) !== (b.revokedAt === null)) return a.revokedAt === null ? -1 : 1;
        return b.createdAt - a.createdAt;
    });
}

export function KeysPanel({ keys: initial, agents, account, now }: KeysPanelProps) {
    const [keys, setKeys] = useState(initial);
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [fresh, setFresh] = useState<string | null>(null);
    const rows = useMemo(() => ordered(keys), [keys]);
    const active = keys.filter((key) => key.revokedAt === null);

    function revoke(id: string) {
        // Only a listed key's row can revoke it
        const key = keys.find((item) => item.id === id)!;
        setKeys((list) =>
            list.map((item) => (item.id === id ? { ...item, revokedAt: now, revokedBy: account } : item)),
        );
        setFresh(id);
        setNote(`Key ${key.name} revoked. Agents using it are refused from now on.`);
    }

    function created(key: AgentKey) {
        setKeys((list) => [key, ...list]);
        setNote(`Key ${key.name} created.`);
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

            <DataTable minWidth={940} className="text-[14px]">
                <caption className="sr-only">
                    Agent keys: {active.length} active, {keys.length - active.length} revoked
                </caption>
                <Cols widths={WIDTHS} />
                <Head
                    first="Key"
                    rest={[
                        "Scope and agents",
                        "Owner",
                        "Created",
                        "Last used",
                        "Status",
                        <span key="a" className="sr-only">
                            Actions
                        </span>,
                    ]}
                />
                <tbody>
                    {rows.map((item) => (
                        <KeyRow key={item.id} item={item} now={now} fresh={fresh === item.id} onRevoke={revoke} />
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
                agents={agents}
                takenNames={active.map((key) => key.name)}
                account={account}
                now={now}
                onCreated={created}
            />
        </section>
    );
}
