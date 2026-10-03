import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/lib/data/rng";
import { stubRandomBytes } from "../../../../test/settings/random";
import { pickOption } from "../../../../test/settings/select";
import { KeyDrawer } from "./key-drawer";

// The real drawer, with its last open-change handler kept so a test can ask it to open
const drawer = vi.hoisted((): { onOpenChange: (open: boolean) => void } => ({ onOpenChange: () => {} }));
vi.mock("@/components/ui/drawer", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/components/ui/drawer")>();
    return {
        Drawer: (props: Parameters<typeof real.Drawer>[0]) => {
            drawer.onOpenChange = props.onOpenChange;
            return <real.Drawer {...props} />;
        },
    };
});

const SECRET = "qk_live_000102030405060708090a0b0c0d0e0f";

function setup(open = true) {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    const props = { agents: ["billing", "support"], takenNames: ["staging"], account: "dana@acme.com", now: NOW };
    const view = render(<KeyDrawer open={open} onOpenChange={onOpenChange} onCreated={onCreated} {...props} />);
    const rerender = (next: boolean) =>
        view.rerender(<KeyDrawer open={next} onOpenChange={onOpenChange} onCreated={onCreated} {...props} />);
    return { onOpenChange, onCreated, rerender };
}

function detail(term: string): string {
    return screen.getByText(term).nextElementSibling?.textContent ?? "";
}

async function createKey(name: string, scope?: string) {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    if (scope) {
        await pickOption("Scope", scope);
        await pickOption("Agent", "support");
    } else {
        fireEvent.click(screen.getByRole("checkbox", { name: "billing" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "support" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await act(async () => {});
    await act(() => vi.advanceTimersByTimeAsync(700));
}

beforeEach(() => {
    vi.useFakeTimers();
    stubRandomBytes();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("KeyDrawer", () => {
    it("opens on the create form", async () => {
        setup();
        await act(async () => {});
        expect(screen.getByRole("dialog", { name: "Create key" })).toBeTruthy();
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    });

    it("shows the full secret once after the key is made, and reports the new key", async () => {
        const { onCreated } = setup();
        await createKey("billing-service");
        expect(screen.getByRole("dialog", { name: "Key created" })).toBeTruthy();
        expect(screen.getByText("Copy this key now. It is shown only once.")).toBeTruthy();
        expect(screen.getByText(SECRET)).toBeTruthy();
        expect(screen.getByRole("button", { name: /Copy$/ })).toBeTruthy();
        expect(detail("Name")).toBe("billing-service");
        expect(detail("Prefix")).toBe("qk_live_0001…");
        expect(detail("Scope")).toBe("One app");
        expect(detail("Agents")).toBe("billing, support");
        expect(screen.getByText(/^QUARD_KEY=/)).toBeTruthy();
        expect(onCreated).toHaveBeenCalledWith({
            id: "key_0001",
            name: "billing-service",
            prefix: "qk_live_0001…",
            scope: "app",
            agents: ["billing", "support"],
            createdAt: NOW,
            createdBy: "dana@acme.com",
            lastUsedAt: null,
            revokedAt: null,
            revokedBy: null,
        });
    });

    it("names a one-agent scope in the summary", async () => {
        setup();
        await createKey("support-bot", "One agent");
        expect(detail("Scope")).toBe("One agent");
        expect(detail("Agents")).toBe("support");
    });

    it("closes when the secret is saved and forgets it before the next open", async () => {
        const { onOpenChange, rerender } = setup();
        await createKey("billing-service");
        fireEvent.click(screen.getByRole("button", { name: "I saved the key" }));
        expect(onOpenChange).toHaveBeenCalledWith(false);

        rerender(false);
        await act(() => vi.advanceTimersByTimeAsync(240));
        rerender(true);
        await act(async () => {});
        expect(screen.queryByText(SECRET)).toBeNull();
        expect(screen.getByRole("dialog", { name: "Create key" })).toBeTruthy();
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    });

    it("closes from the form's cancel button", () => {
        const { onOpenChange } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("passes a request to open straight through without resetting", async () => {
        const { onOpenChange } = setup(false);
        act(() => drawer.onOpenChange(true));
        expect(onOpenChange).toHaveBeenCalledWith(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
