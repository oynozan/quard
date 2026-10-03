import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeyForm } from "./key-form";

function setup({ busy = false, error = null as string | null } = {}) {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<KeyForm takenNames={["staging"]} busy={busy} error={error} onSubmit={onSubmit} onCancel={onCancel} />);
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

async function create() {
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await act(async () => {});
}

describe("KeyForm", () => {
    it("asks only for a name", () => {
        setup();
        expect(nameInput().value).toBe("");
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("asks for a name when sent empty and focuses it", async () => {
        const { onSubmit } = setup();
        await create();
        expect(nameIssue()).toBe("Give the key a name, such as the app that will use it.");
        expect(document.activeElement).toBe(nameInput());
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

    it("sends the name once it is fine", async () => {
        const { onSubmit } = setup();
        typeName("billing-service");
        await create();
        expect(nameIssue()).toBeNull();
        expect(onSubmit).toHaveBeenCalledWith("billing-service");
    });

    it("stays busy while the key is made", () => {
        setup({ busy: true });
        expect(screen.getByRole("button", { name: /Creating key…/ }).getAttribute("aria-busy")).toBe("true");
        expect(nameInput().disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows what the server refused", () => {
        setup({ error: "Sign in again to change agent keys." });
        expect(screen.getByRole("alert").textContent).toBe("Sign in again to change agent keys.");
    });

    it("cancels", () => {
        const { onCancel } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
