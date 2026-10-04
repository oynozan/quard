"use client";

import { useState, useTransition } from "react";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { DrawerActions, DrawerSection } from "@/components/kit/detail/drawer-parts";
import { WarningRule } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { CreatedKey, CreateKeyResult } from "@/lib/data/settings";
import { KeyForm } from "./key-form";

type KeyDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    takenNames: string[];
    createAction: (name: string) => Promise<CreateKeyResult>;
    // Told the new key's name once it exists
    onCreated: (name: string) => void;
};

const FAILED = "Could not create the key. Try again.";

// The SDK takes the key in quard.configure, with the webhook and control addresses
const USE_IT = `quard.configure({
    key: process.env.QUARD_AGENT_KEY,
    webhookUrl: process.env.QUARD_WEBHOOK_URL,
    controlUrl: process.env.QUARD_CONTROL_URL,
});`;

// Create a key, then show the full secret once with a Copy button
export function KeyDrawer({ open, onOpenChange, takenNames, createAction, onCreated }: KeyDrawerProps) {
    const [created, setCreated] = useState<CreatedKey | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [session, setSession] = useState(0);
    const [busy, startTransition] = useTransition();

    function change(next: boolean) {
        // Closing while the key is made would lose the secret
        if (busy && !next) return;
        onOpenChange(next);
        if (!next) {
            // Forget the secret once the closing wipe has finished
            setTimeout(() => {
                setCreated(null);
                setError(null);
                setSession((s) => s + 1);
            }, 240);
        }
    }

    function submit(name: string) {
        setError(null);
        startTransition(async () => {
            const result = await createAction(name).catch((): CreateKeyResult => ({ error: FAILED }));
            startTransition(() => {
                if ("error" in result) {
                    setError(result.error);
                    return;
                }
                setCreated(result);
                onCreated(result.key.name);
            });
        });
    }

    return (
        <Drawer
            open={open}
            onOpenChange={change}
            title={created ? "Key created" : "Create key"}
            view={created ? "created" : "form"}
        >
            {created ? (
                <ShownOnce created={created} onDone={() => change(false)} />
            ) : (
                <KeyForm
                    key={session}
                    takenNames={takenNames}
                    busy={busy}
                    error={error}
                    onSubmit={submit}
                    onCancel={() => change(false)}
                />
            )}
        </Drawer>
    );
}

function ShownOnce({ created, onDone }: { created: CreatedKey; onDone: () => void }) {
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
                        {key.prefix}…
                    </DetailRow>
                </DetailList>
            </DrawerSection>
            <DrawerSection title="Use it">
                <pre className="mono overflow-x-auto rounded-md bg-recess px-3 py-[10px] text-[12px] leading-[1.6] text-ink-soft">
                    {USE_IT}
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
