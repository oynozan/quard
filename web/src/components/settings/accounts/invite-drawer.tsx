"use client";

import { useState, type FormEvent } from "react";
import { DrawerActions } from "@/components/kit/detail/drawer-parts";
import { Field } from "@/components/kit/form/field";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Account } from "@/lib/data/settings";
import { isEmail } from "@/lib/mask";
import { pause } from "../lib/new-key";
import { ROLE_HELP } from "./roles";

type InviteDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    taken: string[];
    onInvited: (email: string, role: Account["role"]) => void;
};

const ROLE_OPTIONS = [
    { value: "approver", label: "Approver" },
    { value: "admin", label: "Admin" },
];

function emailProblem(value: string, taken: string[]): string | null {
    const email = value.trim().toLowerCase();
    if (!email) return "Enter an email address.";
    if (!isEmail(email)) return "Check for a missing @ or domain.";
    if (taken.includes(email)) return "This person already has an account.";
    return null;
}

// Invite one person with a role; the form resets each time the drawer opens
export function InviteDrawer({ open, onOpenChange, taken, onInvited }: InviteDrawerProps) {
    const [session, setSession] = useState(0);

    function close() {
        onOpenChange(false);
        setTimeout(() => setSession((s) => s + 1), 240);
    }

    return (
        <Drawer open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())} title="Invite someone">
            <InviteForm
                key={session}
                taken={taken}
                onCancel={close}
                onInvited={(email, role) => {
                    onInvited(email, role);
                    close();
                }}
            />
        </Drawer>
    );
}

type InviteFormProps = Omit<InviteDrawerProps, "open" | "onOpenChange"> & { onCancel: () => void };

function InviteForm({ taken, onInvited, onCancel }: InviteFormProps) {
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Account["role"]>("approver");
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        const issue = emailProblem(email, taken);
        setProblem(issue);
        if (issue) {
            document.getElementById("invite-email")?.focus();
            return;
        }
        setBusy(true);
        await pause(700);
        onInvited(email.trim().toLowerCase(), role);
    }

    return (
        <form className="mt-7" onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="invite-email" problem={problem}>
                <Input
                    id="invite-email"
                    type="email"
                    autoComplete="off"
                    placeholder="name@acme.com"
                    value={email}
                    disabled={busy}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (problem && !emailProblem(event.target.value, taken)) setProblem(null);
                    }}
                    onBlur={() => email.trim() && setProblem(emailProblem(email, taken))}
                />
            </Field>
            <Field label="Role" htmlFor="invite-role" hint={ROLE_HELP[role]}>
                <Select
                    id="invite-role"
                    options={ROLE_OPTIONS}
                    value={role}
                    disabled={busy}
                    onValueChange={(value) => setRole(value as Account["role"])}
                />
            </Field>
            <DrawerActions
                cancel={
                    <Button type="button" variant="link" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                }
            >
                <Hint content="They sign in with a code sent to this email, or with GitHub.">
                    <Button type="submit" variant="default" busy={busy}>
                        {busy ? "Sending invite…" : "Send invite"}
                    </Button>
                </Hint>
            </DrawerActions>
        </form>
    );
}
