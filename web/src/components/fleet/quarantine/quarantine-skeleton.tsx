import { DataTable, Th } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";

// The quarantine list while the fleet data loads
export function QuarantineSkeleton() {
    return (
        <section aria-label="Quarantine" aria-busy>
            <SectionHeading title="Quarantine" />
            <DataTable minWidth={820}>
                <thead>
                    <tr>
                        <Th>Value</Th>
                        <Th>Agents</Th>
                        <Th>Quarantined</Th>
                        <Th>Blocked</Th>
                        <Th>Last attempt</Th>
                        <Th>
                            <span className="sr-only">Actions</span>
                        </Th>
                    </tr>
                </thead>
                <SkeletonRows columns={6} rows={3} label="Loading quarantine…" />
            </DataTable>
        </section>
    );
}
