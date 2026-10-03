"use client";

import { useState, type FormEvent } from "react";
import { DrawerActions } from "@/components/kit/detail/drawer-parts";
import { Field } from "@/components/kit/form/field";
import { Button } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { nameProblem, type KeyDraft } from "../lib/new-key";

type KeyFormProps = {
    agents: string[];
    takenNames: string[];
    onSubmit: (draft: KeyDraft) => Promise<void>;
    onCancel: () => void;
};

const ENV_OPTIONS = [
    { value: "live", label: "Live (qk_live_)" },
    { value: "test", label: "Test (qk_test_)" },
];

const SCOPE_OPTIONS = [
    { value: "app", label: "One app with several agents" },
    { value: "agent", label: "One agent" },
];

// The create form: a name, the environment, and which agents may use the key
export function KeyForm({ agents, takenNames, onSubmit, onCancel }: KeyFormProps) {
    const [draft, setDraft] = useState<KeyDraft>({ name: "", env: "live", scope: "app", agents: [] });
    const [nameIssue, setNameIssue] = useState<string | null>(null);
    const [agentIssue, setAgentIssue] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    function setScope(scope: KeyDraft["scope"]) {
        setDraft((d) => ({ ...d, scope, agents: scope === "agent" ? d.agents.slice(0, 1) : d.agents }));
    }

    function toggleAgent(agent: string, on: boolean) {
        setAgentIssue(null);
        setDraft((d) => ({ ...d, agents: on ? [...d.agents, agent] : d.agents.filter((a) => a !== agent) }));
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        const nameError = nameProblem(draft.name, takenNames);
        const agentError = draft.agents.length === 0 ? "Choose at least one agent for this key." : null;
        setNameIssue(nameError);
        setAgentIssue(agentError);
        if (nameError) {
            document.getElementById("key-name")?.focus();
            return;
        }
        if (agentError) return;
        setBusy(true);
        await onSubmit(draft);
    }

    return (
        <form className="mt-7" onSubmit={submit} noValidate>
            <Field label="Name" htmlFor="key-name" problem={nameIssue}>
                <Input
                    id="key-name"
                    mono
                    autoComplete="off"
                    placeholder="billing-service"
                    value={draft.name}
                    disabled={busy}
                    onChange={(event) => {
                        const name = event.target.value;
                        setDraft((d) => ({ ...d, name }));
                        if (nameIssue && name.trim()) setNameIssue(null);
                    }}
                    onBlur={() => draft.name.trim() && setNameIssue(nameProblem(draft.name, takenNames))}
                />
            </Field>
            <Field label="Environment" htmlFor="key-env">
                <Select
                    id="key-env"
                    options={ENV_OPTIONS}
                    value={draft.env}
                    disabled={busy}
                    onValueChange={(env) => setDraft((d) => ({ ...d, env: env as KeyDraft["env"] }))}
                />
            </Field>
            <Field label="Scope" htmlFor="key-scope">
                <Select
                    id="key-scope"
                    options={SCOPE_OPTIONS}
                    value={draft.scope}
                    disabled={busy}
                    onValueChange={(scope) => setScope(scope as KeyDraft["scope"])}
                />
            </Field>
            {draft.scope === "agent" ? (
                <Field label="Agent" htmlFor="key-agent" problem={agentIssue}>
                    <Select
                        id="key-agent"
                        placeholder="Choose an agent"
                        options={agents.map((agent) => ({ value: agent, label: agent }))}
                        value={draft.agents[0] ?? null}
                        disabled={busy}
                        onValueChange={(agent) => {
                            setAgentIssue(null);
                            setDraft((d) => ({ ...d, agents: [agent] }));
                        }}
                    />
                </Field>
            ) : (
                <fieldset className="mb-[18px]" disabled={busy}>
                    <legend className="mb-[9px] text-[14px]">Agents</legend>
                    <div className="grid grid-cols-2 gap-x-4 max-[480px]:grid-cols-1">
                        {agents.map((agent) => (
                            <CheckRow
                                key={agent}
                                className="mb-3"
                                checked={draft.agents.includes(agent)}
                                onCheckedChange={(on) => toggleAgent(agent, on)}
                            >
                                <span className="mono text-[13px]">{agent}</span>
                            </CheckRow>
                        ))}
                    </div>
                    {agentIssue ? (
                        <p role="status" className="mt-1 text-[12px] leading-[1.7] text-problem">
                            {agentIssue}
                        </p>
                    ) : null}
                </fieldset>
            )}
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
