import type { LabelRecord } from "@quard/shared";
import { configure, getConfig, type QuardConfig } from "../core/config.ts";
import { forgetProjectKey, projectRedactor, waitForProjectKey } from "../core/project-key.ts";
import { createKeyFetch, type KeyFetch } from "./key-fetch.ts";
import { createLabelSender, type LabelSender } from "./label-sender.ts";
import { activeControl, setActiveControl } from "./link/active.ts";
import { createControl, type Control } from "./link/control.ts";
import { controlSocketUrl } from "./link/url.ts";
import { createUploader, type Uploader } from "./uploader.ts";

type UploadSettings = { key: string; webhookUrl: string };
type LinkSettings = { key: string; url: string };

let uploads: { settings: string; uploader: Uploader; labels: LabelSender; keys: KeyFetch } | undefined;
let link: { settings: string; control: Control } | undefined;
let exitHooked = false;

// What to start from key, webhookUrl and controlUrl, or throws
function servicesFor(config: Partial<QuardConfig>): { uploads?: UploadSettings; link?: LinkSettings } {
    const { key, webhookUrl, controlUrl } = config;
    if (!key && !webhookUrl && !controlUrl) {
        return {};
    }
    if (!key || (!webhookUrl && !controlUrl)) {
        throw new Error("Uploads and the control link need key together with webhookUrl or controlUrl");
    }
    return {
        uploads: webhookUrl ? { key, webhookUrl } : undefined,
        link: controlUrl ? { key, url: controlSocketUrl(controlUrl) } : undefined,
    };
}

// quard.configure() changes settings, then starts uploads and the control link once set up
export function configureQuard(options: Partial<QuardConfig>): void {
    // Checked before anything changes, so a bad call leaves the old settings
    const services = servicesFor({ ...getConfig(), ...options });
    const agentKey = getConfig().key;
    configure(options);
    // Each project hashes with its own key, so another agent key needs its own
    if (getConfig().key !== agentKey) {
        forgetProjectKey();
    }
    startUploads(services.uploads);
    startLink(services.link);
}

function startUploads(settings: UploadSettings | undefined): void {
    const id = JSON.stringify(settings ?? null);
    if (uploads?.settings === id) {
        return;
    }
    stopUploads();
    if (settings !== undefined) {
        const keys = createKeyFetch(settings);
        const uploader = createUploader({ ...settings, redactor: keys.redactor });
        uploader.start();
        uploads = {
            settings: id,
            uploader,
            labels: createLabelSender({ ...settings, redactor: projectRedactor }),
            keys,
        };
        hookExit();
    }
}

function startLink(settings: LinkSettings | undefined): void {
    const id = JSON.stringify(settings ?? null);
    if (link?.settings === id) {
        return;
    }
    stopLink();
    if (settings !== undefined) {
        const control = createControl({ url: settings.url, key: settings.key });
        link = { settings: id, control };
        setActiveControl(control);
    }
}

// The last events go out when the process is about to exit
function hookExit(): void {
    if (!exitHooked) {
        exitHooked = true;
        process.once("beforeExit", () => {
            void uploads?.uploader.flush();
        });
    }
}

export function stopUploads(): void {
    uploads?.uploader.stop();
    uploads?.keys.stop();
    uploads = undefined;
}

export function stopLink(): void {
    link?.control.stop();
    link = undefined;
    setActiveControl(undefined);
}

// Sends what is buffered now, if uploads are on
export function flushUploads(): Promise<boolean> {
    return uploads?.uploader.flush() ?? Promise.resolve(true);
}

export function uploadsOn(): boolean {
    return uploads !== undefined;
}

// Stores label records in webhook now, false when uploads are off
export function sendLabels(records: LabelRecord[]): Promise<boolean> {
    return uploads?.labels(records) ?? Promise.resolve(false);
}

// Waits up to ms for the project's hash key, which webhook hands out at
// once and control with its ready message. Undefined when neither is set
// up, else whether the key came.
export async function waitForHashKey(ms: number): Promise<boolean | undefined> {
    const control = activeControl();
    if (uploads === undefined && control === undefined) {
        return undefined;
    }
    const asked = uploads?.keys.redactor();
    // Without control, nothing else can bring the key once webhook answered
    return (await waitForProjectKey(ms, control === undefined ? asked : undefined)) !== undefined;
}
