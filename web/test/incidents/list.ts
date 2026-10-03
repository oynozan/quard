import type { Incident } from "@/lib/data/types";
import { HOUR, MINUTE, NOW } from "../time";

// Three incidents, newest first, across three categories and replay states
export const INCIDENTS: Incident[] = [
    {
        id: "inc_118",
        runId: "4bf92f3577b34da6a3ce929d0e0e4736",
        title: "Payment to an IBAN copied from a supplier page",
        category: "bad input",
        entryPoint: "fetch_page · supplier-portal.example",
        damage: "pay_invoice asked with an untrusted IBAN",
        entryAgent: "researcher",
        damageAgent: "billing",
        replay: "running",
        openedAt: NOW - 3 * MINUTE,
    },
    {
        id: "inc_117",
        runId: "c3a8f0d2e5b14976a0c2d8e1f6b3a947",
        title: "Spending cap dropped in a handoff",
        category: "bad handoff",
        entryPoint: "delegate · orchestrator to billing",
        damage: "pay_invoice blocked by the daily cap",
        entryAgent: "orchestrator",
        damageAgent: "billing",
        replay: "confirmed",
        openedAt: NOW - 5 * HOUR,
    },
    {
        id: "inc_115",
        runId: "e81b5c2d9f3a4e7b8c6d0a1f2e3b4c5d",
        title: "Customer list sent to an unlisted domain",
        category: "missing guard",
        entryPoint: "search_docs · docs.example.internal",
        damage: "export_contacts ran without an egress guard",
        entryAgent: "support",
        damageAgent: "support",
        replay: "not confirmed",
        openedAt: NOW - 48 * HOUR,
    },
];
