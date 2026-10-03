import { quard } from "quard";

// Loads OPENAI_API_KEY, and the optional settings below, from sandbox/.env.
// Values already in the environment win.
try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
    // No sandbox/.env; the key may still be in the environment
}

if (!process.env.OPENAI_API_KEY) {
    console.error("Add your OpenAI API key to sandbox/.env, like this: OPENAI_API_KEY=sk-...");
    process.exit(1);
}

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

// With an agent key, runs also go to a local Quard backend and show up in the dashboard
export const DASHBOARD = Boolean(process.env.QUARD_AGENT_KEY);

if (DASHBOARD) {
    quard.configure({
        key: process.env.QUARD_AGENT_KEY,
        webhookUrl: process.env.QUARD_WEBHOOK_URL || "http://localhost:4100",
        controlUrl: process.env.QUARD_CONTROL_URL || "http://localhost:4200",
        hashKey: process.env.QUARD_HASH_KEY,
    });
}

// For examples that need the local backend: explains the setup and stops
export function needsDashboard(): void {
    if (!DASHBOARD) {
        console.error(
            "This example needs the local Quard backend. Start it as sandbox/README.md shows, then set QUARD_AGENT_KEY and QUARD_HASH_KEY in sandbox/.env.",
        );
        process.exit(1);
    }
}
