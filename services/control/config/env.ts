import { readServerConfig } from "@quard/db/server";

// Control listens on 4200 unless PORT says otherwise
export const readConfig = (env: Record<string, string | undefined>) => readServerConfig(env, 4200);
