import { FleetView } from "@/components/fleet/fleet-view";
import { getFleet, getQuarantine } from "@/lib/data/fleet";

export const metadata = { title: "Summary" };

// The charts and the quarantine, read from Postgres
export default async function SummaryPage() {
    const [fleet, quarantine] = await Promise.all([getFleet(), getQuarantine()]);
    return <FleetView fleet={fleet} quarantine={quarantine} />;
}
