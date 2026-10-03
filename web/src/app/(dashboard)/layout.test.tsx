import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/auth-app/browser";
import { shadersModule } from "../../../test/auth-app/shell";
import { signSession, type Session } from "@/lib/auth/session-token";
import { openApprovals } from "@/lib/data/approvals";
import DashboardLayout from "./layout";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined) }),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/runs",
    redirect: (to: string) => {
        throw new Error(`redirect:${to}`);
    },
}));
vi.mock("@paper-design/shaders", () => shadersModule);

const SECRET = "s".repeat(40);

async function signIn(who: Pick<Session, "email" | "github">) {
    const exp = Math.floor(Date.now() / 1000) + 600;
    jar.set("quard_session", await signSession({ sub: "did:privy:1", exp, ...who }, SECRET));
}

async function showLayout() {
    render(await DashboardLayout({ params: Promise.resolve({}), children: <h1>Runs page</h1> }));
}

// The signed-in person's row: the name, then the line under it
function accountRow() {
    const row = screen.getByRole("button", { name: "Sign out" }).parentElement!;
    return [row.querySelector("strong")!.textContent, row.querySelector("small")!.textContent];
}

describe("DashboardLayout", () => {
    beforeEach(() => {
        jar.clear();
        stubBrowser();
        vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "cm0000000000000000000000a");
        vi.stubEnv("PRIVY_APP_SECRET", "secret");
        vi.stubEnv("QUARD_SESSION_SECRET", SECRET);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("puts the page in the app shell, with the open approvals count", async () => {
        await signIn({ email: "dana@acme.com", github: null });
        await showLayout();
        expect(screen.getByRole("main").textContent).toBe("Runs page");
        const waiting = openApprovals().length;
        expect(waiting).toBeGreaterThan(0);
        expect(screen.getByRole("link", { name: `Review ${waiting} approvals` })).toBeTruthy();
        expect(screen.queryByText("acme-prod")).toBeNull();
    });

    it("shows an email account as signed in", async () => {
        await signIn({ email: "dana@acme.com", github: null });
        await showLayout();
        expect(accountRow()).toEqual(["dana@acme.com", "Signed in"]);
    });

    it("adds the GitHub name under the email when both are linked", async () => {
        await signIn({ email: "dana@acme.com", github: "dana-k" });
        await showLayout();
        expect(accountRow()).toEqual(["dana@acme.com", "@dana-k"]);
    });

    it("names a GitHub-only account by its handle", async () => {
        await signIn({ email: null, github: "dana-k" });
        await showLayout();
        expect(accountRow()).toEqual(["@dana-k", "GitHub"]);
    });

    it("sends visitors without a session to sign in", async () => {
        await expect(showLayout()).rejects.toThrow("redirect:/sign-in");
    });
});
