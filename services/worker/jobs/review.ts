import { saveReview, type ClaimedJob, type StoredReview } from "@quard/db";
import { callModel, type Fetch, type OpenAiConfig } from "../openai/call.ts";
import { withPlaceholders } from "../review/placeholders.ts";
import { messageOf, type JobDeps } from "./deps.ts";

// PROJECT.md "AI reviewer"
export const REVIEW_MODEL = "gpt-6.1-sol";

const INSTRUCTIONS = [
    "You explain an incident verdict to the team that runs an AI agent.",
    "The verdict is JSON. entry is where the harm came in, turning is the model call that asked for the",
    "damaging call, damage is that tool call, missingGuard is the guard that would have stopped it, and",
    "values says where each value of the call came from.",
    "Write 2 to 4 short paragraphs in plain words, separated by blank lines, with no headings or lists.",
    "Use only the facts in the verdict. Do not invent facts.",
    "Placeholders such as [IBAN 1] stand for hidden values: keep them as they are.",
].join(" ");

// The note and what it cost
async function writeNote(openai: OpenAiConfig, job: ClaimedJob, fetch?: Fetch): Promise<[StoredReview, number]> {
    const input = withPlaceholders(JSON.stringify(job.verdict));
    const body = { model: REVIEW_MODEL, store: false, instructions: INSTRUCTIONS, input };
    const answer = await callModel(openai, body, fetch);
    const paragraphs = answer.text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== "");
    if (paragraphs.length === 0) {
        return [{ error: "The reviewer wrote nothing" }, answer.costUsd];
    }
    const note = { model: REVIEW_MODEL, costUsd: answer.costUsd, writtenAt: new Date().toISOString(), paragraphs };
    return [note, answer.costUsd];
}

// The AI reviewer's plain-words note on the verdict. Skipped without a provider key.
export async function runReview(deps: JobDeps, job: ClaimedJob): Promise<string> {
    const { db, openai } = deps;
    if (openai === undefined) {
        await saveReview(db, job.projectId, job.id, null, 0);
        return "skipped: OPENAI_API_KEY is not set";
    }
    const [review, costUsd] = await writeNote(openai, job, deps.fetch).catch(
        (error: unknown): [StoredReview, number] => [{ error: messageOf(error) }, 0],
    );
    await saveReview(db, job.projectId, job.id, review, costUsd);
    return "error" in review ? `failed: ${review.error}` : "note written";
}
