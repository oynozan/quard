import { projectForKey, type Db } from "@quard/db";

const MAX_ISSUES = 5;

// What a failed schema check reports
type Issues = { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };

function bearer(header: string | undefined): string | undefined {
    return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}

// The project of the agent key in an Authorization header, if it is valid
export async function projectFor(db: Db, header: string | undefined): Promise<string | undefined> {
    const key = bearer(header);
    return key === undefined ? undefined : projectForKey(db, key);
}

// The parsed body, or undefined when it is not JSON
export async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}

// The first few problems with a body, as "path: message"
export function issuesOf(error: Issues): string[] {
    return error.issues.slice(0, MAX_ISSUES).map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`);
}
