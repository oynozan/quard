import { hostname } from "node:os";
import { APPROVAL_BEAT_MS, createRedactor, type ClientMessage, type Redactor } from "@quard/shared";
import { noteDayUsed } from "../../guards/limit/daily.ts";
import type { FleetView } from "../../guards/limit/fleet.ts";
import { knownVersions, type AgentVersion } from "../../monitor/versions.ts";
import { rulesSnapshot } from "../../policy/rules.ts";
import { createApprovals, type Approvals } from "./approvals.ts";
import { createLink, LINK_TIMING, type Link, type LinkTiming } from "./link.ts";
import { createFleetState } from "./quarantine.ts";
import { createReplays, type Replays } from "./queue.ts";
import { createRequests, type Requests } from "./requests.ts";
import type { OpenSocket } from "./socket.ts";
import { SDK_VERSION } from "./version.ts";

export type ControlTiming = LinkTiming & {
    // How long a call that needs control waits for it to come back
    downMs: number;
    // How long a count or fleet report waits for its answer
    replyMs: number;
    // How long the synced quarantine list stays in use while control is away
    staleMs: number;
    beatMs: number;
};

export const CONTROL_TIMING: ControlTiming = {
    ...LINK_TIMING,
    downMs: 30_000,
    replyMs: 5_000,
    staleMs: 24 * 60 * 60 * 1000,
    beatMs: APPROVAL_BEAT_MS,
};

export type ControlOptions = {
    // The WebSocket URL, from controlSocketUrl()
    url: string;
    key: string;
    hashKey: Buffer;
    open?: OpenSocket;
    warn?: (message: string) => void;
    timing?: Partial<ControlTiming>;
};

export type Control = {
    link: Link;
    requests: Requests;
    approvals: Approvals;
    fleet: FleetView;
    replays: Replays;
    hashKey: Buffer;
    replyMs: number;
    // Sends the active rules when they changed since control last saw them
    syncRules(): void;
    sendAgent(version: AgentVersion): void;
    stop(): void;
};

const MAX_NAME = 200;
const MAX_TOOLS = 500;
const MAX_INSTRUCTIONS = 100_000;

function agentMessage(version: AgentVersion, redactor: Redactor): ClientMessage {
    const { instructions } = version;
    return {
        type: "agent",
        agent: version.agent.slice(0, MAX_NAME),
        version: version.version,
        model: version.model.slice(0, MAX_NAME),
        tools: version.tools.filter((tool) => tool !== "" && tool.length <= MAX_NAME).slice(0, MAX_TOOLS),
        ...(instructions === undefined ? {} : { instructions: redactor.text(instructions).slice(0, MAX_INSTRUCTIONS) }),
    };
}

// Approvals, per-day counts, the fleet check, rules and agent versions through control
export function createControl(options: ControlOptions): Control {
    const timing = { ...CONTROL_TIMING, ...options.timing };
    const redactor = createRedactor(options.hashKey);
    let sentRules: string | undefined;
    const link = createLink({
        url: options.url,
        key: options.key,
        open: options.open,
        warn: options.warn,
        timing,
        hello: () => {
            const rules = rulesSnapshot();
            sentRules = rules.hash;
            return { type: "hello", sdk: SDK_VERSION, host: hostname().slice(0, 255), pid: process.pid, rules };
        },
    });
    const requests = createRequests(link);
    const approvals = createApprovals(link, timing.downMs, timing.beatMs);
    const fleet = createFleetState(link, redactor, timing.staleMs);
    const replays = createReplays(link, requests, timing.replyMs);
    const sendAgent = (version: AgentVersion) => {
        link.send(agentMessage(version, redactor));
    };
    link.listen({
        ready: (message) => {
            for (const count of message.counters) {
                noteDayUsed(count.day, count.tool, count.counter, count.used);
            }
            knownVersions().forEach(sendAgent);
        },
    });
    link.start();
    return {
        link,
        requests,
        approvals,
        fleet,
        replays,
        hashKey: options.hashKey,
        replyMs: timing.replyMs,
        syncRules: () => {
            const rules = rulesSnapshot();
            if (rules.hash !== sentRules && link.send({ type: "rules", rules })) {
                sentRules = rules.hash;
            }
        },
        sendAgent,
        stop: () => {
            link.stop();
            approvals.stop();
            requests.stop();
        },
    };
}
