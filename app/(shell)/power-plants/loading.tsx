import { PageLayout } from "@texturehq/edges";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";

export default function PowerPlantsLoading() {
  return (
    <PageLayout
      className="flex flex-col h-full overflow-hidden bg-background-default"
      paddingYClass="pt-8 md:pt-12"
      paddingXClass="px-4"
    >
      <div className="flex-none">
        <PageLayout.Header title="Power Plants" sticky={true} />
      </div>
      <div className="flex-1 px-1 pt-4">
        <DataTableSkeleton rows={15} columns={6} />
      </div>
    </PageLayout>
  );
}
