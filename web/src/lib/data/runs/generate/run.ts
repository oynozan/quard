import { chance, pick } from "../../rng";
import { RunBuilder, type BuiltRun } from "../build/builder";
import { ORCHESTRATOR_TASKS, RESULT, valuesIn } from "./content";
import { billingWork, researcherWork } from "./work-desk";
import { deployWork, supportWork, triageWork } from "./work-ops";
import type { RunPlan } from "./plan";

function orchestratorWork(b: RunBuilder, plan: RunPlan): void {
    const task = pick(b.rng, ORCHESTRATOR_TASKS);
    b.model("orchestrator", { input: { text: task.text, values: valuesIn(task.text) }, calls: ["delegate"] });
    for (const [index, step] of task.steps.entries()) {
        const sent = b.delegate("orchestrator", step.agent, { text: step.brief, values: valuesIn(step.brief) });
        if (!sent.link) break;
        if (step.agent === "researcher") researcherWork(b, plan);
        else if (step.agent === "billing") billingWork(b, plan, false, step.supplierId);
        else supportWork(b, plan, false);
        // A helper that ended the run reports nothing back, and the orchestrator stops.
        if (b.ending) return;
        b.message(step.agent, "orchestrator", { text: RESULT[step.agent] ?? "Done." });
        const more = index < task.steps.length - 1;
        b.model("orchestrator", { calls: more ? ["delegate"] : [], detail: more ? undefined : "Answered the user" });
        if (!more) break;
    }
    if (!b.ending && chance(b.rng, 0.3)) {
        b.tool("orchestrator", "summarize", {
            args: { text: "Results from the helpers" },
            kinds: { text: "text" },
            output: { summary: "A short summary for the user" },
        });
        b.model("orchestrator", { detail: "Answered the user" });
    }
}

// Writes a run nobody scripted, from its plan. The same plan always gives the same run.
export function generateRun(plan: RunPlan): BuiltRun {
    const b = new RunBuilder(plan.id, plan.startedAt);
    b.paidTodayEur = b.int(0, 28) * 1000;
    switch (plan.root) {
        case "orchestrator":
            orchestratorWork(b, plan);
            break;
        case "support":
            supportWork(b, plan, true);
            break;
        case "inbox-triage":
            triageWork(b, plan);
            break;
        case "billing":
            billingWork(b, plan, true);
            break;
        default:
            deployWork(b, plan);
    }
    return b.finish();
}
