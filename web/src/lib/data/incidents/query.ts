import type { Incident } from "../types";
import type { IncidentDetail } from "./types";

// Every incident, newest first, empty until incidents are stored
export async function listIncidents(): Promise<Incident[]> {
    return [];
}

// An incident's verdict, path, replay and AI note, null until incidents are stored
export const getIncident: (id: string) => Promise<IncidentDetail | null> = async () => null;
