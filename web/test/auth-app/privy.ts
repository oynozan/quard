import { act } from "@testing-library/react";
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from "react";
import { vi } from "vitest";

// A stand-in for @privy-io/react-auth. Tests change its state and read the calls it got.

type Login = { wasAlreadyAuthenticated: boolean };
type OnComplete = (login: Login) => void;

type State = {
    ready: boolean;
    emailStatus: string;
    oauthStatus: string;
    oauthLoading: boolean;
};

const START: State = { ready: true, emailStatus: "initial", oauthStatus: "initial", oauthLoading: false };

let state: State = { ...START };
const listeners = new Set<() => void>();
const completes: { email?: OnComplete; github?: OnComplete } = {};

export const privy = {
    getAccessToken: vi.fn<() => Promise<string | null>>(),
    logout: vi.fn<() => Promise<void>>(),
    sendCode: vi.fn<(args: { email: string }) => Promise<void>>(),
    loginWithCode: vi.fn<(args: { code: string }) => Promise<void>>(),
    initOAuth: vi.fn<(args: { provider: string }) => Promise<void>>(),
    provider: vi.fn<(props: { appId: string; config: unknown }) => void>(),
};

// Puts every mock back to a working Privy that is ready
export function resetPrivy() {
    state = { ...START };
    privy.getAccessToken.mockReset().mockResolvedValue("privy-token");
    privy.logout.mockReset().mockResolvedValue(undefined);
    privy.sendCode.mockReset().mockResolvedValue(undefined);
    privy.loginWithCode.mockReset().mockResolvedValue(undefined);
    privy.initOAuth.mockReset().mockResolvedValue(undefined);
    privy.provider.mockReset();
}

// Changes what the hooks report and re-renders whoever reads them
export function setPrivy(patch: Partial<State>) {
    act(() => {
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
    });
}

// Privy calling back after a sign-in, as it does once a code or GitHub succeeds
export async function completeLogin(via: "email" | "github", login: Login) {
    await act(async () => completes[via]!(login));
}

function useState(): State {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => state,
    );
}

export const privyModule = {
    PrivyProvider: ({ appId, config, children }: { appId: string; config: unknown; children: ReactNode }) => {
        privy.provider({ appId, config });
        return createElement(Fragment, null, children);
    },
    Captcha: () => null,
    usePrivy: () => {
        const { ready } = useState();
        return { ready, getAccessToken: privy.getAccessToken, logout: privy.logout };
    },
    useLoginWithEmail: ({ onComplete }: { onComplete: OnComplete }) => {
        completes.email = onComplete;
        const { emailStatus } = useState();
        return { sendCode: privy.sendCode, loginWithCode: privy.loginWithCode, state: { status: emailStatus } };
    },
    useLoginWithOAuth: ({ onComplete }: { onComplete: OnComplete }) => {
        completes.github = onComplete;
        const { oauthStatus, oauthLoading } = useState();
        return { initOAuth: privy.initOAuth, loading: oauthLoading, state: { status: oauthStatus } };
    },
};
