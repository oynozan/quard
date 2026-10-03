import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickOption } from "../../../../test/settings/select";
import { InviteDrawer } from "./invite-drawer";

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

const TAKEN = ["dana@acme.com"];

function setup(open = true) {
    const onOpenChange = vi.fn();
    const onInvited = vi.fn();
    const view = render(<InviteDrawer open={open} onOpenChange={onOpenChange} taken={TAKEN} onInvited={onInvited} />);
    const rerender = (next: boolean) =>
        view.rerender(<InviteDrawer open={next} onOpenChange={onOpenChange} taken={TAKEN} onInvited={onInvited} />);
    return { onOpenChange, onInvited, rerender };
}

function email(): HTMLInputElement {
    return screen.getByLabelText("Email") as HTMLInputElement;
}

function type(value: string) {
    fireEvent.change(email(), { target: { value } });
}

function problem(): string | null {
    return email().parentElement?.querySelector('[role="status"]')?.textContent ?? null;
}

async function send() {
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await act(async () => {});
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("InviteDrawer", () => {
    it("opens on an empty form that invites an approver by default", async () => {
        setup();
        await act(async () => {});
        expect(screen.getByRole("dialog", { name: "Invite someone" })).toBeTruthy();
        expect(email().value).toBe("");
        expect(email().getAttribute("placeholder")).toBe("name@acme.com");
        expect(screen.getByRole("combobox", { name: "Role" }).textContent).toBe("Approver");
        expect(screen.getByText("Answers approvals only")).toBeTruthy();
    });

    it("asks for an email and focuses the field when sent empty", async () => {
        const { onInvited } = setup();
        await send();
        expect(problem()).toBe("Enter an email address.");
        expect(document.activeElement).toBe(email());
        expect(onInvited).not.toHaveBeenCalled();
    });

    it("points at a missing @ or domain", async () => {
        setup();
        type("dana");
        await send();
        expect(problem()).toBe("Check for a missing @ or domain.");
    });

    it("refuses someone who already has an account, ignoring case and spaces", async () => {
        setup();
        type("  DANA@acme.com ");
        await send();
        expect(problem()).toBe("This person already has an account.");
    });

    it("checks the email on blur, but not while the field is empty", () => {
        setup();
        fireEvent.blur(email());
        expect(problem()).toBeNull();
        type("marco@");
        fireEvent.blur(email());
        expect(problem()).toBe("Check for a missing @ or domain.");
    });

    it("keeps the problem while the email is still wrong and clears it once it is right", () => {
        setup();
        type("marco@");
        fireEvent.blur(email());
        type("marco@acme");
        expect(problem()).toBe("Check for a missing @ or domain.");
        type("marco@acme.com");
        expect(problem()).toBeNull();
    });

    it("explains the admin role when it is picked", async () => {
        setup();
        await pickOption("Role", "Admin");
        expect(screen.getByRole("combobox", { name: "Role" }).textContent).toBe("Admin");
        expect(screen.getByText("Also manages settings")).toBeTruthy();
    });

    it("shows a busy state, then reports the invite in lower case and closes", async () => {
        const { onInvited, onOpenChange } = setup();
        await pickOption("Role", "Admin");
        type(" New.Person@Acme.com ");
        await send();
        const busy = screen.getByRole("button", { name: /Sending invite…/ });
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(email().disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
        expect(onInvited).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(700));
        expect(onInvited).toHaveBeenCalledWith("new.person@acme.com", "admin");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("cancels, and the form is empty again when the drawer reopens", async () => {
        const { onOpenChange, rerender } = setup();
        type("marco@");
        fireEvent.blur(email());
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onOpenChange).toHaveBeenCalledWith(false);

        rerender(false);
        await act(() => vi.advanceTimersByTimeAsync(240));
        rerender(true);
        await act(async () => {});
        expect(email().value).toBe("");
        expect(problem()).toBeNull();
    });

    it("closes from the close button", async () => {
        const { onOpenChange } = setup();
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await act(async () => {});
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("passes a request to open straight through", async () => {
        const { onOpenChange } = setup(false);
        act(() => drawer.onOpenChange(true));
        expect(onOpenChange).toHaveBeenCalledWith(true);
    });
});
