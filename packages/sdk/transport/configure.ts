import { createRedactor, parseHashKey, type LabelRecord } from "@quard/shared";
import { configure, getConfig, type QuardConfig } from "../core/config.ts";
import { createLabelSender, type LabelSender } from "./label-sender.ts";
import { setActiveControl } from "./link/active.ts";
import { createControl, type Control } from "./link/control.ts";
import { controlSocketUrl } from "./link/url.ts";
import { createUploader, type Uploader } from "./uploader.ts";

type UploadSettings = { key: string; webhookUrl: string; hashKey: string };
type LinkSettings = { key: string; url: string; hashKey: string };

let uploads: { settings: string; uploader: Uploader; labels: LabelSender } | undefined;
let link: { settings: string; control: Control } | undefined;
let exitHooked = false;

// What to start from key, webhookUrl, controlUrl and hashKey, or throws
function servicesFor(config: Partial<QuardConfig>): { uploads?: UploadSettings; link?: LinkSettings } {
    const { key, webhookUrl, controlUrl, hashKey } = config;
    if (!key && !webhookUrl && !controlUrl && !hashKey) {
        return {};
    }
    if (!key || !hashKey || (!webhookUrl && !controlUrl)) {
        throw new Error("Uploads and the control link need key and hashKey together with webhookUrl or controlUrl");
    }
    parseHashKey(hashKey);
    return {
        uploads: webhookUrl ? { key, webhookUrl, hashKey } : undefined,
        link: controlUrl ? { key, url: controlSocketUrl(controlUrl), hashKey } : undefined,
    };
}

// quard.configure() changes settings, then starts uploads and the control link once set up
export function configureQuard(options: Partial<QuardConfig>): void {
    // Checked before anything changes, so a bad call leaves the old settings
    const services = servicesFor({ ...getConfig(), ...options });
    configure(options);
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
        const redactor = createRedactor(parseHashKey(settings.hashKey));
        const target = { webhookUrl: settings.webhookUrl, key: settings.key, redactor };
        const uploader = createUploader(target);
        uploader.start();
        uploads = { settings: id, uploader, labels: createLabelSender(target) };
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
        const control = createControl({
            url: settings.url,
            key: settings.key,
            hashKey: parseHashKey(settings.hashKey),
        });
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
