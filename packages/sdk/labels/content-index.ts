import { createHash, randomBytes } from "node:crypto";
import { combineLabels, extractValues, type ContextLabel, type Label } from "@quard/shared";

export type Match = "exact" | "host" | "domain";

// One place a value appeared in content the run read
export type Occurrence = {
    contentId: string;
    origin: string;
    trust: Label["trust"];
    sensitivity: Label["sensitivity"];
    flags: string[];
    stepId: string;
    order: number;
    match: Match;
};

export type ContentRecord = {
    id: string;
    label: Label;
    stepId: string;
    order: number;
    keys: string[];
    // A hash of the exact text, so content is only stored once
    print: string;
};

export type AddOptions = {
    // Keys never indexed for this content, such as values echoed from a call's input
    exclude?: ReadonlySet<string>;
    // Keys indexed before keep their earlier labels
    keepEarlier?: boolean;
    // A record vouched for this content's values, so made-up keys come in too
    vouched?: boolean;
};

function matchOf(key: string): Match {
    if (key.startsWith("host:")) {
        return "host";
    }
    return key.startsWith("domain:") ? "domain" : "exact";
}

// For dedupe in this index only. It never goes into a record.
function hash(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

// Everything the model read in one run, with labels and value keys
export class ContentIndex {
    // A run resumed in another process gets its own index, so ids carry a random tag
    readonly #tag = randomBytes(4).toString("hex");
    readonly #records: ContentRecord[] = [];
    readonly #byKey = new Map<string, ContentRecord[]>();
    readonly #seen = new Set<string>();
    // Keys of values a model wrote that no record vouched for, such as an
    // IBAN read back from memory. No trusted content vouches for them, not
    // even the user's or the system's, which app code may fill with them.
    readonly #madeUp = new Set<string>();

    #push(entry: Omit<ContentRecord, "id" | "order">): ContentRecord {
        const id = `c${this.#records.length + 1}-${this.#tag}`;
        const record: ContentRecord = { ...entry, id, order: this.#records.length };
        this.#records.push(record);
        for (const key of record.keys) {
            this.#byKey.set(key, [...(this.#byKey.get(key) ?? []), record]);
        }
        return record;
    }

    // Content seen before keeps its first label. Only the exact text
    // counts: a copy with hidden text added is new content.
    add(text: string, label: Label, stepId: string, options: AddOptions = {}): ContentRecord | undefined {
        const print = hash(text);
        if (text.trim() === "" || this.#seen.has(print)) {
            return undefined;
        }
        this.#seen.add(print);
        const skipMadeUp = label.trust === "trusted" && options.vouched !== true;
        const keys = [...new Set(extractValues(text).flatMap((value) => value.keys))].filter(
            (key) =>
                options.exclude?.has(key) !== true &&
                !(options.keepEarlier === true && this.#byKey.has(key)) &&
                !(skipMadeUp && this.#madeUp.has(key)),
        );
        return this.#push({ label, stepId, keys, print });
    }

    markMadeUp(keys: Iterable<string>): void {
        for (const key of keys) {
            this.#madeUp.add(key);
        }
    }

    // Takes in what another run read, keeping its labels
    absorb(other: ContentIndex): void {
        this.markMadeUp(other.#madeUp);
        for (const record of other.#records) {
            if (!this.#seen.has(record.print)) {
                this.#seen.add(record.print);
                this.#push({ label: record.label, stepId: record.stepId, keys: record.keys, print: record.print });
            }
        }
    }

    has(text: string): boolean {
        return this.#seen.has(hash(text));
    }

    // Keys come strongest first, so the first match per record is kept
    lookup(keys: readonly string[]): Occurrence[] {
        const found = new Map<string, Occurrence>();
        for (const key of keys) {
            for (const record of this.#byKey.get(key) ?? []) {
                if (!found.has(record.id)) {
                    found.set(record.id, {
                        contentId: record.id,
                        origin: record.label.origin,
                        trust: record.label.trust,
                        sensitivity: record.label.sensitivity,
                        flags: record.label.flags,
                        stepId: record.stepId,
                        order: record.order,
                        match: matchOf(key),
                    });
                }
            }
        }
        return [...found.values()].sort((a, b) => a.order - b.order);
    }

    context(): ContextLabel {
        return combineLabels(this.#records.map((record) => record.label));
    }

    get size(): number {
        return this.#records.length;
    }
}
