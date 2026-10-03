import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/runs/detail/run-view";
import { getRun } from "@/lib/data/runs/query";
import { shortId } from "@/lib/format";
import { PAGE_WIDE } from "@/components/kit/page";

const RUN_ID = /^[0-9a-f]{32}$/;

export async function generateMetadata(props: PageProps<"/runs/[runId]">): Promise<Metadata> {
    const { runId } = await props.params;
    return { title: RUN_ID.test(runId) ? `Run ${shortId(runId)}` : "Run not found" };
}

export default async function RunPage(props: PageProps<"/runs/[runId]">) {
    const [{ runId }, query] = await Promise.all([props.params, props.searchParams]);
    if (!RUN_ID.test(runId)) notFound();
    const run = await getRun(runId);
    if (!run) notFound();
    // ?step=<id> opens that step in the drawer, as search results link
    const step = typeof query.step === "string" ? query.step : undefined;

    return (
        <div className={PAGE_WIDE}>
            <RunView run={run} step={step} />
        </div>
    );
}
