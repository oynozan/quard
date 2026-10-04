import { readServerConfig } from "@quard/db/server";

// Webhook listens on 4100 unless PORT says otherwise
export const readConfig = (env: Record<string, string | undefined>) => readServerConfig(env, 4100);
