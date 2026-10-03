import { createHash } from "node:crypto";
import { cleanText, combineLabels, extractValues, type ContextLabel, type Label } from "@quard/shared";

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
    // A hash of the normalized text, so content is only stored once
    print: string;
};

export type AddOptions = {
    // Keys never indexed for this content, such as values echoed from a call's input
    exclude?: ReadonlySet<string>;
    // Keys indexed before keep their earlier labels
    keepEarlier?: boolean;
};

function matchOf(key: string): Match {
    if (key.startsWith("host:")) {
        return "host";
    }
    return key.startsWith("domain:") ? "domain" : "exact";
}

function normalized(text: string): string {
    return cleanText(text).replace(/\s+/g, " ").trim();
}

function hash(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

// Everything the model read in one run, with labels and value keys
export class ContentIndex {
    readonly #records: ContentRecord[] = [];
    readonly #byKey = new Map<string, ContentRecord[]>();
    readonly #seen = new Set<string>();

    #push(entry: Omit<ContentRecord, "id" | "order">): ContentRecord {
        const record: ContentRecord = { ...entry, id: `c${this.#records.length + 1}`, order: this.#records.length };
        this.#records.push(record);
        for (const key of record.keys) {
            this.#byKey.set(key, [...(this.#byKey.get(key) ?? []), record]);
        }
        return record;
    }

    // Content seen before keeps its first label
    add(text: string, label: Label, stepId: string, options: AddOptions = {}): ContentRecord | undefined {
        const plain = normalized(text);
        if (plain === "" || this.#seen.has(hash(plain))) {
            return undefined;
        }
        this.#seen.add(hash(plain));
        const keys = [...new Set(extractValues(text).flatMap((value) => value.keys))].filter(
            (key) => options.exclude?.has(key) !== true && !(options.keepEarlier === true && this.#byKey.has(key)),
        );
        return this.#push({ label, stepId, keys, print: hash(plain) });
    }

    // Takes in what another run read, keeping its labels
    absorb(other: ContentIndex): void {
        for (const record of other.#records) {
            if (!this.#seen.has(record.print)) {
                this.#seen.add(record.print);
                this.#push({ label: record.label, stepId: record.stepId, keys: record.keys, print: record.print });
            }
        }
    }

    has(text: string): boolean {
        return this.#seen.has(hash(normalized(text)));
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
