import { createRedactor, parseHashKey } from "@quard/shared";
import { configure, getConfig, type QuardConfig } from "../core/config.ts";
import { createUploader, type Uploader } from "./uploader.ts";

let active: { settings: string; uploader: Uploader } | undefined;
let exitHooked = false;

// The settings uploads need, or undefined when none are set
function uploadSettings(
    config: Partial<QuardConfig>,
): { key: string; webhookUrl: string; hashKey: string } | undefined {
    const { key, webhookUrl, hashKey } = config;
    if (!key && !webhookUrl && !hashKey) {
        return undefined;
    }
    if (!key || !webhookUrl || !hashKey) {
        throw new Error("Uploads need key, webhookUrl and hashKey together");
    }
    return { key, webhookUrl, hashKey };
}

// quard.configure(): changes settings, and starts uploads to webhook
// once key, webhookUrl and hashKey are all set
export function configureQuard(options: Partial<QuardConfig>): void {
    // Checked before anything changes, so a bad call leaves the old settings
    const settings = uploadSettings({ ...getConfig(), ...options });
    const redactor = settings && createRedactor(parseHashKey(settings.hashKey));
    configure(options);
    const id = JSON.stringify(settings ?? null);
    if (active?.settings === id) {
        return;
    }
    stopUploads();
    if (settings && redactor) {
        const uploader = createUploader({ webhookUrl: settings.webhookUrl, key: settings.key, redactor });
        uploader.start();
        active = { settings: id, uploader };
        hookExit();
    }
}

// The last events go out when the process is about to exit
function hookExit(): void {
    if (!exitHooked) {
        exitHooked = true;
        process.once("beforeExit", () => {
            void active?.uploader.flush();
        });
    }
}

export function stopUploads(): void {
    active?.uploader.stop();
    active = undefined;
}

// Sends what is buffered now, if uploads are on
export function flushUploads(): Promise<boolean> {
    return active?.uploader.flush() ?? Promise.resolve(true);
}
