import { PageHeading } from "@/components/kit/headings";
import { SearchSkeleton } from "@/components/search/states/search-skeleton";
import { PAGE_LIST } from "@/components/kit/page";

export default function SearchLoading() {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Search" />
            <SearchSkeleton />
        </div>
    );
}
