"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SignInPanel } from "./sign-in-panel";

type PrivySignInProps = { appId: string; next: string; signedOut: boolean };

// Privy loads on this page only. Email codes and GitHub are the only ways in; no wallets.
export function PrivySignIn({ appId, next, signedOut }: PrivySignInProps) {
    return (
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ["email", "github"],
                appearance: { theme: "dark", accentColor: "#00DA71", showWalletLoginFirst: false, walletList: [] },
                embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
            }}
        >
            <SignInPanel next={next} signedOut={signedOut} />
        </PrivyProvider>
    );
}
