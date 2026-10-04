"use client";

import { useEffect } from "react";
import { markIncidentSeen } from "@/lib/data/incidents/actions";

// Runs in the browser only, so a link prefetch never marks the incident as seen
export function MarkSeen({ id }: { id: string }) {
    useEffect(() => {
        // A failed mark only keeps the red outline on the list
        markIncidentSeen(id).catch(() => {});
    }, [id]);
    return null;
}
