import { combineLabels, extractValues, hasInvisible, labelFor, newStepId, originKind, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import type { Scope } from "../context/scope.ts";
import type { AddOptions } from "../labels/content-index.ts";
import { printOf } from "../labels/print.ts";
import { textOf } from "../labels/text-of.ts";
import { lookupLabels } from "../transport/labels.ts";
import { recordMemory } from "./event.ts";
import { keptLabels } from "./kept.ts";
import { mergeLabels, type MemoryLabels } from "./merge.ts";
import { localHash } from "./values.ts";

// The labels this process kept for the content, or else the backend's.
// Only records of this exact content vouch for it.
async function findLabels(print: string): Promise<MemoryLabels | undefined> {
    const own = keptLabels(print);
    if (own !== undefined) {
        return own;
    }
    // A lookup that fails counts as no record
    const records = await lookupLabels({ kind: "memory", print }).catch(() => undefined);
    const [first, ...rest] = (records ?? []).filter((found) => found.kind === "memory" && found.print === print);
    return first === undefined ? undefined : rest.reduce<MemoryLabels>(mergeLabels, first);
}

// Unlabeled memory gets the unknown default: untrusted, internal. A
// team's override for the store's origin applies only to labeled items.
// Hidden characters can carry text a human never sees, so an item with
// them is untrusted and flagged, whatever its records say.
function itemLabel(origin: string, text: string, labels: MemoryLabels | undefined): Label {
    if (hasInvisible(text)) {
        return labelFor(origin, {}, ["invisible_text"]);
    }
    if (labels === undefined) {
        return labelFor(origin);
    }
    const overrides = getConfig().origins;
    const own = Object.hasOwn(overrides, origin) ? overrides[origin] : undefined;
    const { trust, sensitivity, flagged } = labels.label;
    return labelFor(origin, { [origin]: { trust, sensitivity, ...own } }, flagged ? ["flagged"] : []);
}

// skipEmpty: content that adds no value keys is not worth an event
function addContent(
    scope: Scope,
    stepId: string,
    text: string,
    label: Label,
    options: AddOptions,
    skipEmpty = false,
): void {
    const added = scope.run.index.add(text, label, stepId, options);
    if (added !== undefined && !(skipEmpty && added.keys.length === 0)) {
        record({
            type: "content",
            runId: scope.run.runId,
            stepId,
            agent: scope.agent,
            at: now(),
            contentId: added.id,
            origin: label.origin,
            trust: label.trust,
            sensitivity: label.sensitivity,
            flags: label.flags,
            keys: added.keys,
        });
    }
}

// Values the item's records vouch for come in first with their stored
// labels, so a web-derived IBAN stays web-derived here. Then the item.
function indexItem(scope: Scope, stepId: string, text: string, label: Label, labels: MemoryLabels | undefined): void {
    const stored = new Map(labels?.values.map((value) => [value.hash, value]));
    for (const { type, value } of extractValues(text)) {
        const found = stored.get(localHash(type, value));
        if (found !== undefined) {
            // Only the value's own key: its host and domain take the item's label
            const key = `${type}:${value}`;
            const exclude = new Set(extractValues(value).flatMap((other) => other.keys.filter((k) => k !== key)));
            const { origin, trust, sensitivity, flags } = found;
            const own = { origin, kind: originKind(origin), trust, sensitivity, flags };
            addContent(scope, stepId, value, own, { exclude, keepEarlier: true }, true);
        }
    }
    addContent(scope, stepId, text, label, { keepEarlier: true });
}

// Reads, then labels each item and adds it to the run's content index.
// many: a list result holds one item per element.
export async function readThrough(
    scope: Scope,
    store: string,
    many: boolean,
    read: () => Promise<unknown>,
): Promise<unknown> {
    const stepId = newStepId();
    const result = await read();
    const list: unknown[] = many && Array.isArray(result) ? result : [result];
    const items = list.filter((item) => item !== undefined && item !== null);
    const found = await Promise.all(
        items.map(async (item) => ({ text: textOf(item), labels: await findLabels(printOf(item)) })),
    );
    const origin = `memory:${store}`;
    const labels = found.map(({ text, labels }) => {
        const label = itemLabel(origin, text, labels);
        indexItem(scope, stepId, text, label, labels);
        return label;
    });
    const verified = found.filter((item) => item.labels !== undefined).length;
    const { trust, sensitivity } = combineLabels(labels);
    recordMemory(scope, stepId, { store, op: "read", items: items.length, verified, trust, sensitivity });
    return result;
}
