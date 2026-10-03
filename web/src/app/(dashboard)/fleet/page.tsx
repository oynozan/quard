import { FleetView } from "@/components/fleet/fleet-view";
import { getFleet } from "@/lib/data/fleet";

export const metadata = { title: "Fleet" };

export default async function FleetPage() {
    const fleet = await getFleet();
    return <FleetView fleet={fleet} />;
}
