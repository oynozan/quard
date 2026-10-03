// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthEnv } from "./env";

const verifyAccessToken = vi.fn();
const getUser = vi.fn();
const created: unknown[] = [];

vi.mock("@privy-io/node", () => ({
    InvalidAuthTokenError: class InvalidAuthTokenError extends Error {},
    PrivyClient: class {
        constructor(options: unknown) {
            created.push(options);
        }
        utils() {
            return { auth: () => ({ verifyAccessToken }) };
        }
        users() {
            return { _get: getUser };
        }
    },
}));

const { InvalidAuthTokenError } = await import("@privy-io/node");
const { verifyPrivyLogin } = await import("./privy");

const env: AuthEnv = {
    appId: "app",
    appSecret: "secret",
    verificationKey: null,
    sessionSecret: "s".repeat(40),
    production: false,
};

describe("verifyPrivyLogin", () => {
    beforeEach(() => {
        verifyAccessToken.mockReset();
        getUser.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    it("returns who signed in", async () => {
        verifyAccessToken.mockResolvedValue({ user_id: "did:privy:1" });
        getUser.mockResolvedValue({ linked_accounts: [{ type: "github_oauth", username: "dana" }] });
        expect(await verifyPrivyLogin("token", env)).toEqual({ sub: "did:privy:1", email: null, github: "dana" });
        expect(verifyAccessToken).toHaveBeenCalledWith("token");
        expect(getUser).toHaveBeenCalledWith("did:privy:1");
    });

    it("returns null for a token Privy rejects, and logs why", async () => {
        verifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("Authentication token expired"));
        expect(await verifyPrivyLogin("bad", env)).toBeNull();
        expect(getUser).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith("[auth] Privy token check failed:", "Authentication token expired");
    });

    it("throws setup and network failures so they are not mistaken for bad tokens", async () => {
        verifyAccessToken.mockRejectedValue("offline");
        await expect(verifyPrivyLogin("token", env)).rejects.toBe("offline");
        verifyAccessToken.mockResolvedValue({ user_id: "did:privy:1" });
        getUser.mockRejectedValue(new Error("network"));
        await expect(verifyPrivyLogin("token", env)).rejects.toThrow("network");
    });

    it("reuses one client per settings and passes the verification key", async () => {
        verifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("x"));
        const before = created.length;
        await verifyPrivyLogin("a", env);
        await verifyPrivyLogin("b", env);
        expect(created.length).toBe(before);
        await verifyPrivyLogin("c", { ...env, verificationKey: "pem" });
        expect(created.at(-1)).toEqual({ appId: "app", appSecret: "secret", jwtVerificationKey: "pem" });
    });
});
