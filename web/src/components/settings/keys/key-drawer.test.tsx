import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateKeyResult } from "@/lib/data/settings";
import { KeyDrawer } from "./key-drawer";

// The real drawer, with its last open-change handler kept so a test can ask it to open or close
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

const SECRET = `qk_live_65c7${"ab".repeat(22)}`;

function made(name: string): CreateKeyResult {
    return { key: { id: "key-1", name, prefix: SECRET.slice(0, 12) }, secret: SECRET };
}

function setup(open = true) {
    const props = {
        takenNames: ["staging"],
        onOpenChange: vi.fn(),
        onCreated: vi.fn(),
        createAction: vi.fn(async (name: string) => made(name)),
    };
    const view = render(<KeyDrawer open={open} {...props} />);
    const rerender = (next: boolean) => view.rerender(<KeyDrawer open={next} {...props} />);
    return { ...props, rerender };
}

function detail(term: string): string {
    return screen.getByText(term).nextElementSibling?.textContent ?? "";
}

async function submit(name: string) {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await act(async () => {});
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("KeyDrawer", () => {
    it("opens on the create form", async () => {
        setup();
        await act(async () => {});
        expect(screen.getByRole("dialog", { name: "Create key" })).toBeTruthy();
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    });

    it("shows the full secret once the server made the key, with how the SDK takes it", async () => {
        const { createAction, onCreated } = setup();
        await submit("billing-service");

        expect(createAction).toHaveBeenCalledWith("billing-service");
        expect(screen.getByRole("dialog", { name: "Key created" })).toBeTruthy();
        expect(screen.getByText("Copy this key now. It is shown only once.")).toBeTruthy();
        expect(screen.getByText(SECRET)).toBeTruthy();
        expect(screen.getByRole("button", { name: /Copy$/ })).toBeTruthy();
        expect(detail("Name")).toBe("billing-service");
        expect(detail("Prefix")).toBe("qk_live_65c7…");
        const snippet = screen.getByText(/^quard\.configure/).textContent;
        expect(snippet).toContain("key: process.env.QUARD_AGENT_KEY");
        expect(snippet).toContain("webhookUrl: process.env.QUARD_WEBHOOK_URL");
        expect(snippet).toContain("controlUrl: process.env.QUARD_CONTROL_URL");
        // The agent key is the only secret an agent holds
        expect(snippet).not.toMatch(/hash/i);
        expect(onCreated).toHaveBeenCalledWith("billing-service");
    });

    it("stays busy and open while the server makes the key", async () => {
        let finish: (result: CreateKeyResult) => void = () => {};
        const { createAction, onOpenChange } = setup();
        createAction.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
        await submit("billing-service");

        expect(screen.getByRole("button", { name: /Creating key…/ }).getAttribute("aria-busy")).toBe("true");
        act(() => drawer.onOpenChange(false));
        expect(onOpenChange).not.toHaveBeenCalled();

        await act(async () => finish(made("billing-service")));
        expect(screen.getByText(SECRET)).toBeTruthy();
    });

    it("shows what the server refused and lets the person try again", async () => {
        const { createAction } = setup();
        createAction.mockResolvedValueOnce({ error: "An active key already has this name." });
        await submit("billing-service");

        expect(screen.getByRole("alert").textContent).toBe("An active key already has this name.");
        expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(false);
        await submit("billing-service-2");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("dialog", { name: "Key created" })).toBeTruthy();
    });

    it("says the key could not be created when the server cannot be reached", async () => {
        const { createAction, onCreated } = setup();
        createAction.mockRejectedValueOnce(new Error("offline"));
        await submit("billing-service");

        expect(screen.getByRole("alert").textContent).toBe("Could not create the key. Try again.");
        expect(onCreated).not.toHaveBeenCalled();
    });

    it("closes when the secret is saved and forgets it before the next open", async () => {
        const { onOpenChange, rerender } = setup();
        await submit("billing-service");
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
