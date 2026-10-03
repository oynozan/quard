import { AppShell } from "@/components/shell/app-shell";
import { displayName } from "@/lib/auth/access";
import { requireSession } from "@/lib/auth/session";
import { openApprovalCount } from "@/lib/data/approvals";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
    // The proxy already turned away anyone without a session; this reads who it is.
    const session = await requireSession();
    // The second line adds what the first does not already say.
    const sub = session.email && session.github ? `@${session.github}` : session.github ? "GitHub" : "Signed in";
    const waiting = await openApprovalCount();

    return (
        <AppShell openApprovals={waiting} account={{ email: displayName(session), role: sub }}>
            {children}
        </AppShell>
    );
}
