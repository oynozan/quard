import { PageHeading } from "@/components/kit/headings";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { SETTINGS_CONTAINER } from "@/components/settings/tabs";

export default function SettingsLoading() {
    return (
        <div className={SETTINGS_CONTAINER}>
            <PageHeading title="Settings" />
            <SettingsSkeleton />
        </div>
    );
}
