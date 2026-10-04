import { resetConfig } from "../core/config.ts";
import { forgetProjectKey } from "../core/project-key.ts";
import { takeEvents } from "../core/recorder.ts";
import { clearRegistry } from "../context/registry.ts";
import { clearApprovals } from "../guards/approval/approval.ts";
import { clearDayCounts } from "../guards/limit/daily.ts";
import { clearRecords } from "../labels/records.ts";
import { clearMemory } from "../memory/kept.ts";
import { clearHostedApprovals } from "../monitor/hosted/mcp.ts";
import { clearVersions } from "../monitor/versions.ts";
import { stopLink, stopUploads } from "../transport/configure.ts";
import { clearChecked } from "../x402/checked.ts";
import { clearPayments } from "../x402/record/payments.ts";

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
    forgetProjectKey();
    clearDayCounts();
    clearVersions();
    clearChecked();
    clearPayments();
    clearHostedApprovals();
}
