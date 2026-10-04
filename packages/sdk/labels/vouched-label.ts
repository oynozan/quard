import { combineLabels, labelFor, type ContextLabel } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import type { ContentIndex } from "./content-index.ts";

// The label a run gives content it sends or stores. A run that read
// nothing can't say where the content came from, so it is unknown.
export function vouchedLabel(index: ContentIndex): ContextLabel {
    return index.size === 0 ? combineLabels([labelFor("unknown", getConfig().origins)]) : index.context();
}
