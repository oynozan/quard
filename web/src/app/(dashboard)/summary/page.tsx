import { FleetView } from "@/components/fleet/fleet-view";
import { getFleet } from "@/lib/data/fleet";

export const metadata = { title: "Summary" };

export default async function SummaryPage() {
    const fleet = await getFleet();
    return <FleetView fleet={fleet} />;
}
