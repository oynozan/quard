"use client";

import { useState } from "react";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { DrawerActions, DrawerSection } from "@/components/kit/detail/drawer-parts";
import { WarningRule } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { AgentKey } from "@/lib/data/settings";
import { createKey, pause, type KeyDraft } from "../lib/new-key";
import { KeyForm } from "./key-form";

type KeyDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agents: string[];
    takenNames: string[];
    account: string;
    now: number;
    onCreated: (key: AgentKey) => void;
};

type Created = { key: AgentKey; secret: string };

// Create a key, then show the full secret once with a Copy button
export function KeyDrawer({ open, onOpenChange, agents, takenNames, account, now, onCreated }: KeyDrawerProps) {
    const [created, setCreated] = useState<Created | null>(null);
    const [session, setSession] = useState(0);

    function change(next: boolean) {
        onOpenChange(next);
        if (!next) {
            // Forget the secret once the closing wipe has finished
            setTimeout(() => {
                setCreated(null);
                setSession((s) => s + 1);
            }, 240);
        }
    }

    async function submit(draft: KeyDraft) {
        await pause(700);
        const result = createKey(draft, account, now);
        setCreated(result);
        onCreated(result.key);
    }

    return (
        <Drawer
            open={open}
            onOpenChange={change}
            title={created ? "Key created" : "Create key"}
            view={created ? "created" : "form"}
        >
            {created ? (
                <CreatedKey created={created} onDone={() => change(false)} />
            ) : (
                <KeyForm
                    key={session}
                    agents={agents}
                    takenNames={takenNames}
                    onSubmit={submit}
                    onCancel={() => change(false)}
                />
            )}
        </Drawer>
    );
}

function CreatedKey({ created, onDone }: { created: Created; onDone: () => void }) {
    const { key, secret } = created;
    return (
        <>
            <WarningRule className="mt-7" title="Copy this key now. It is shown only once." identifier={secret} />
            <DrawerSection title="Key">
                <DetailList>
                    <DetailRow term="Name" mono>
                        {key.name}
                    </DetailRow>
                    <DetailRow term="Prefix" mono>
                        {key.prefix}
                    </DetailRow>
                    <DetailRow term="Scope">{key.scope === "app" ? "One app" : "One agent"}</DetailRow>
                    <DetailRow term="Agents" mono>
                        {key.agents.join(", ")}
                    </DetailRow>
                </DetailList>
            </DrawerSection>
            <DrawerSection title="Use it">
                <pre className="mono overflow-x-auto rounded-md bg-recess px-3 py-[10px] text-[12px] text-ink-soft">
                    QUARD_KEY={key.prefix}
                </pre>
            </DrawerSection>
            <DrawerActions>
                <Button variant="default" onClick={onDone}>
                    I saved the key
                </Button>
            </DrawerActions>
        </>
    );
}
