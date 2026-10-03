import { resetConfig } from "../core/config.ts";
import { takeEvents } from "../core/recorder.ts";
import { clearRegistry } from "../context/registry.ts";
import { clearApprovals } from "../guards/approval/approval.ts";
import { clearDayCounts } from "../guards/limit/daily.ts";
import { clearRecords } from "../labels/records.ts";
import { clearMemory } from "../memory/kept.ts";
import { clearVersions } from "../monitor/versions.ts";
import { stopLink, stopUploads } from "../transport/configure.ts";

// Puts every module-level store back to empty between tests
export function resetAll(): void {
    resetConfig();
    takeEvents();
    clearRegistry();
    clearApprovals();
    clearRecords();
    clearMemory();
    stopUploads();
    stopLink();
    clearDayCounts();
    clearVersions();
}
