import { cleanForMatch } from "./clean.ts";
import { feedSchema, type Feed, type Signature } from "./schema.ts";

export type CompiledSignature = Signature & {
    readonly cleanAll: readonly string[];
    readonly cleanAny: readonly string[];
    readonly cleanNone: readonly string[];
};

export type CompiledFeed = {
    readonly version: string;
    readonly signatures: readonly CompiledSignature[];
};

export function compileFeed(feed: Feed): CompiledFeed {
    const signatures = feed.signatures.map((s) =>
        Object.freeze({
            ...s,
            cleanAll: (s.all ?? []).map(cleanForMatch),
            cleanAny: (s.any ?? []).map(cleanForMatch),
            cleanNone: (s.none ?? []).map(cleanForMatch),
        }),
    );
    return Object.freeze({ version: feed.version, signatures: Object.freeze(signatures) });
}

export function parseFeed(text: string): CompiledFeed {
    return compileFeed(feedSchema.parse(JSON.parse(text)));
}

// Plain substring checks on cleaned text: linear time, so a hostile
// feed can't freeze the process the way a bad regex could.
export function matchSignatures(
    feed: CompiledFeed,
    text: string,
    where: "input" | "content",
    tool: string,
): CompiledSignature[] {
    const clean = cleanForMatch(text);
    return feed.signatures.filter(
        (s) =>
            s.where.includes(where) &&
            (s.tools === undefined || s.tools.includes(tool)) &&
            s.cleanAll.every((l) => clean.includes(l)) &&
            (s.cleanAny.length === 0 || s.cleanAny.some((l) => clean.includes(l))) &&
            !s.cleanNone.some((l) => clean.includes(l)),
    );
}
