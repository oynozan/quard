"use client";

import { useState, type FormEvent } from "react";
import { DrawerActions } from "@/components/kit/detail/drawer-parts";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Field } from "@/components/kit/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nameProblem } from "@/lib/data/settings/key-name";

type KeyFormProps = {
    takenNames: string[];
    // True while the server makes the key
    busy: boolean;
    // What the server refused, if anything
    error: string | null;
    onSubmit: (name: string) => void;
    onCancel: () => void;
};

// The create form, with one field since a key stores only its name
export function KeyForm({ takenNames, busy, error, onSubmit, onCancel }: KeyFormProps) {
    const [name, setName] = useState("");
    const [nameIssue, setNameIssue] = useState<string | null>(null);

    function submit(event: FormEvent) {
        event.preventDefault();
        const problem = nameProblem(name, takenNames);
        setNameIssue(problem);
        if (problem) {
            document.getElementById("key-name")?.focus();
            return;
        }
        onSubmit(name);
    }

    return (
        <form className="mt-7" onSubmit={submit} noValidate>
            <Field label="Name" htmlFor="key-name" problem={nameIssue}>
                <Input
                    id="key-name"
                    mono
                    autoComplete="off"
                    placeholder="billing-service"
                    value={name}
                    disabled={busy}
                    onChange={(event) => {
                        const value = event.target.value;
                        setName(value);
                        if (nameIssue && value.trim()) setNameIssue(null);
                    }}
                    onBlur={() => name.trim() && setNameIssue(nameProblem(name, takenNames))}
                />
            </Field>
            {error ? <ErrorBox className="mt-0">{error}</ErrorBox> : null}
            <DrawerActions
                cancel={
                    <Button type="button" variant="link" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                }
            >
                <Button type="submit" variant="default" busy={busy}>
                    {busy ? "Creating key…" : "Create key"}
                </Button>
            </DrawerActions>
        </form>
    );
}
