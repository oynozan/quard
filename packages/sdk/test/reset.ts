import { resetConfig } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { clearRegistry } from "../context/registry.ts";
import { clearApprovals } from "../guards/approval/approval.ts";
import { stopUploads } from "../transport/configure.ts";

// Puts every module-level store back to empty between tests
export function resetAll(): void {
    resetConfig();
    takeEvents();
    clearRegistry();
    clearApprovals();
    stopUploads();
}
