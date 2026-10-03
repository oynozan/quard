import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privy, privyModule, resetPrivy } from "../../../test/auth-app/privy";
import { PrivySignIn } from "./privy-sign-in";

vi.mock("@privy-io/react-auth", () => privyModule);

describe("PrivySignIn", () => {
    beforeEach(() => {
        resetPrivy();
    });

    it("starts Privy with email and GitHub only, and no wallets", () => {
        render(<PrivySignIn appId="cm0000000000000000000000a" next="/" signedOut={false} />);
        const { appId, config } = privy.provider.mock.calls[0]![0] as {
            appId: string;
            config: {
                loginMethods: string[];
                appearance: { walletList: string[]; showWalletLoginFirst: boolean };
                embeddedWallets: Record<string, { createOnLogin: string }>;
            };
        };
        expect(appId).toBe("cm0000000000000000000000a");
        expect(config.loginMethods).toEqual(["email", "github"]);
        expect(config.appearance.walletList).toEqual([]);
        expect(config.appearance.showWalletLoginFirst).toBe(false);
        expect(config.embeddedWallets.ethereum!.createOnLogin).toBe("off");
        expect(config.embeddedWallets.solana!.createOnLogin).toBe("off");
    });

    it("shows the sign-in panel inside Privy, passing the signed-out note on", () => {
        render(<PrivySignIn appId="cm0000000000000000000000a" next="/runs" signedOut />);
        expect(screen.getByRole("heading", { level: 1, name: "Sign in to Quard" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("You are signed out.");
    });
});
