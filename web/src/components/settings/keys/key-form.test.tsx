import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pickOption } from "../../../../test/settings/select";
import { KeyForm } from "./key-form";

const AGENTS = ["billing", "support", "researcher"];

function setup() {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<KeyForm agents={AGENTS} takenNames={["staging"]} onSubmit={onSubmit} onCancel={onCancel} />);
    return { onSubmit, onCancel };
}

function nameInput(): HTMLInputElement {
    return screen.getByLabelText("Name") as HTMLInputElement;
}

function typeName(value: string) {
    fireEvent.change(nameInput(), { target: { value } });
}

function nameIssue(): string | null {
    return nameInput().parentElement?.querySelector('[role="status"]')?.textContent ?? null;
}

function agentIssue(): string | null {
    const box = screen.queryByRole("group", { name: "Agents" }) ?? screen.getByText("Agent").parentElement;
    return box?.querySelector('[role="status"]')?.textContent ?? null;
}

function check(agent: string) {
    fireEvent.click(screen.getByRole("checkbox", { name: agent }));
}

function checked(): string[] {
    return AGENTS.filter(
        (agent) => screen.getByRole("checkbox", { name: agent }).getAttribute("aria-checked") === "true",
    );
}

async function create() {
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await act(async () => {});
}

describe("KeyForm", () => {
    it("starts with an empty name, a live key for one app and no agents chosen", () => {
        setup();
        expect(nameInput().value).toBe("");
        expect(screen.getByRole("combobox", { name: "Environment" }).textContent).toBe("Live (qk_live_)");
        expect(screen.getByRole("combobox", { name: "Scope" }).textContent).toBe("One app with several agents");
        expect(screen.getByRole("group", { name: "Agents" })).toBeTruthy();
        expect(checked()).toEqual([]);
    });

    it("asks for a name and an agent when sent empty, focusing the name", async () => {
        const { onSubmit } = setup();
        await create();
        expect(nameIssue()).toBe("Give the key a name, such as the app that will use it.");
        expect(agentIssue()).toBe("Choose at least one agent for this key.");
        expect(document.activeElement).toBe(nameInput());
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("asks only for an agent once the name is fine", async () => {
        const { onSubmit } = setup();
        typeName("billing-service");
        await create();
        expect(nameIssue()).toBeNull();
        expect(agentIssue()).toBe("Choose at least one agent for this key.");
        expect(document.activeElement).not.toBe(nameInput());
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("checks the name on blur, but not while it is empty", () => {
        setup();
        fireEvent.blur(nameInput());
        expect(nameIssue()).toBeNull();
        typeName("staging");
        fireEvent.blur(nameInput());
        expect(nameIssue()).toBe("An active key already has this name.");
    });

    it("keeps the name problem while the name is blank and clears it on the first real character", async () => {
        setup();
        await create();
        typeName("   ");
        expect(nameIssue()).toBe("Give the key a name, such as the app that will use it.");
        typeName("b");
        expect(nameIssue()).toBeNull();
    });

    it("clears the agent problem when an agent is checked, and unchecks again", async () => {
        setup();
        await create();
        check("support");
        expect(agentIssue()).toBeNull();
        check("billing");
        expect(checked()).toEqual(["billing", "support"]);
        check("support");
        expect(checked()).toEqual(["billing"]);
    });

    it("sends the draft and turns busy while the key is made", async () => {
        const { onSubmit } = setup();
        typeName("billing-service");
        await pickOption("Environment", "Test (qk_test_)");
        check("billing");
        check("researcher");
        await create();
        expect(onSubmit).toHaveBeenCalledWith({
            name: "billing-service",
            env: "test",
            scope: "app",
            agents: ["billing", "researcher"],
        });
        expect(screen.getByRole("button", { name: /Creating key…/ }).getAttribute("aria-busy")).toBe("true");
        expect(nameInput().disabled).toBe(true);
        expect((screen.getByRole("group", { name: "Agents" }) as HTMLFieldSetElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("keeps only the first agent when the scope narrows to one agent", async () => {
        const { onSubmit } = setup();
        check("support");
        check("billing");
        await pickOption("Scope", "One agent");
        expect(screen.queryByRole("group", { name: "Agents" })).toBeNull();
        expect(screen.getByRole("combobox", { name: "Agent" }).textContent).toBe("support");
        typeName("support-bot");
        await create();
        expect(onSubmit).toHaveBeenCalledWith({
            name: "support-bot",
            env: "live",
            scope: "agent",
            agents: ["support"],
        });
    });

    it("keeps the chosen agents when the scope widens to an app", async () => {
        setup();
        await pickOption("Scope", "One agent");
        await pickOption("Agent", "researcher");
        await pickOption("Scope", "One app with several agents");
        expect(checked()).toEqual(["researcher"]);
    });

    it("asks for an agent in one-agent scope and clears that once one is picked", async () => {
        setup();
        await pickOption("Scope", "One agent");
        expect(screen.getByRole("combobox", { name: "Agent" }).textContent).toBe("Choose an agent");
        typeName("solo");
        await create();
        expect(agentIssue()).toBe("Choose at least one agent for this key.");
        await pickOption("Agent", "billing");
        expect(agentIssue()).toBeNull();
    });

    it("cancels", () => {
        const { onCancel } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
