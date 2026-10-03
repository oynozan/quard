import { randomBytes } from "node:crypto";
import { connect, type Db } from "../connect/connect.ts";
import { createAgentKey, type NewAgentKey } from "../queries/keys.ts";
import { createProject } from "../queries/projects.ts";

// Creates a project and its first agent key. People sign in to the
// dashboard with Privy, so there are no accounts to create here.
export async function setup(db: Db, project: string): Promise<{ projectId: string; key: NewAgentKey }> {
    const projectId = await createProject(db, project);
    const key = await createAgentKey(db, projectId, "default");
    return { projectId, key };
}

// "--project Acme" becomes { project: "Acme" }. A bare "--", which pnpm passes on, is skipped.
export function readFlags(argv: string[]): Record<string, string> {
    const flags: Record<string, string> = {};
    for (let i = 0; i < argv.length - 1; i++) {
        const name = String(argv[i]);
        if (name.startsWith("--") && name !== "--") {
            flags[name.slice(2)] = String(argv[i + 1]);
            i += 1;
        }
    }
    return flags;
}

// Returns the process exit code
export async function setupFromArgs(
    argv: string[],
    env: Record<string, string | undefined>,
    log: (message: string) => void = console.log,
): Promise<number> {
    if (!env.DATABASE_URL) {
        log("DATABASE_URL is not set");
        return 1;
    }
    const db = connect(env.DATABASE_URL, 1);
    try {
        const result = await setup(db, readFlags(argv).project ?? "Default");
        log(`Project:   ${result.projectId}`);
        log(`Agent key: ${result.key.key}`);
        log("The agent key is shown once. Only its hash is stored.");
        if (!env.QUARD_HASH_KEY) {
            log(
                `Set this in every agent process, webhook and control: QUARD_HASH_KEY=${randomBytes(32).toString("hex")}`,
            );
        }
        return 0;
    } finally {
        await db.destroy();
    }
}
