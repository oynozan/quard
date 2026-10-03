import { AppShell } from "@/components/shell/app-shell";
import { openApprovals } from "@/lib/data/approvals";
import { SIGNED_IN } from "@/lib/data/session";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
    const waiting = openApprovals().length;

    return (
        <AppShell openApprovals={waiting} project="acme-prod" account={SIGNED_IN}>
            {children}
        </AppShell>
    );
}
