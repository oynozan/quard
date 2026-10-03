// Anyone may sign in. The only rule: the sign-in must carry a verified email or a GitHub account,
// so wallets and other Privy login methods never open the dashboard.

export type Identity = { email: string | null; github: string | null };

type LinkedAccount = { type: string; address?: unknown; username?: unknown };

// Only the email Privy verified by code counts as an email; GitHub counts by its username.
export function identityOf(accounts: readonly LinkedAccount[]): Identity {
    const email = accounts.find((account) => account.type === "email")?.address;
    const github = accounts.find((account) => account.type === "github_oauth")?.username;
    return {
        email: typeof email === "string" ? email.toLowerCase() : null,
        github: typeof github === "string" ? github : null,
    };
}

export function canEnter(identity: Identity): boolean {
    return identity.email !== null || identity.github !== null;
}

// The name shown for a signed-in person.
export function displayName(identity: Identity): string {
    return identity.email ?? (identity.github ? `@${identity.github}` : "Signed in");
}
