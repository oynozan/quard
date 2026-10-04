import { FleetView } from "@/components/fleet/fleet-view";
import { getFleet, getQuarantine } from "@/lib/data/fleet";
import { getSpend } from "@/lib/data/payments/spend";

export const metadata = { title: "Summary" };

// The charts, x402 spend and the quarantine, read from Postgres
export default async function SummaryPage() {
    const [fleet, quarantine, spend] = await Promise.all([getFleet(), getQuarantine(), getSpend()]);
    return <FleetView fleet={fleet} quarantine={quarantine} spend={spend} />;
}
