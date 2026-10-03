import { AutoRefresh } from "@/components/kit/auto-refresh";

// The refresh lives here because error.tsx replaces the page but not this layout,
// so live updates go on after one refresh fails
export default function ApprovalsLayout({ children }: LayoutProps<"/approvals">) {
    return (
        <>
            <AutoRefresh />
            {children}
        </>
    );
}
