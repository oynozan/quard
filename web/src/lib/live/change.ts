import { CHANNELS, type Notice } from "@quard/db";

// What the browser hears: which part of the dashboard changed
export type Change = { topic: "runs"; runs?: string[] } | { topic: "approvals" } | { topic: "fleet" };

type LiveBody = { project?: unknown; topic?: unknown; runs?: unknown };

// The change one notice means for a project, or null when it does not matter.
// Without a project yet, any project's change matters: the first one shows up.
export function toChange(notice: Notice, project: string | undefined): Change | null {
    switch (notice.channel) {
        case CHANNELS.approvals:
            return { topic: "approvals" };
        case CHANNELS.fleet:
            return ours(notice.payload, project) ? { topic: "fleet" } : null;
        case CHANNELS.live:
            return fromLive(notice.payload, project);
        default:
            return null;
    }
}

function ours(id: unknown, project: string | undefined): boolean {
    return project === undefined || id === project;
}

function fromLive(payload: string, project: string | undefined): Change | null {
    const body = parse(payload);
    if (!body || !ours(body.project, project)) return null;
    if (body.topic === "approvals") return { topic: "approvals" };
    if (body.topic !== "runs") return null;
    return isIds(body.runs) ? { topic: "runs", runs: body.runs } : { topic: "runs" };
}

function parse(payload: string): LiveBody | null {
    try {
        const body: unknown = JSON.parse(payload);
        return typeof body === "object" && body !== null ? (body as LiveBody) : null;
    } catch {
        return null;
    }
}

function isIds(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((id) => typeof id === "string");
}
