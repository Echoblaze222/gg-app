import { Card, Skeleton, SkeletonGroup } from "@/components/ui";

/** Shown while the dashboard loads. Placeholders appear after 300 ms, so a fast load never flashes them. */
export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <h1 className="font-display text-4xl leading-tight">Admin dashboard</h1>
      <SkeletonGroup label="Loading the admin dashboard" className="grid gap-4">
        <Card tone="ink" padding="lg" as="section">
          <div className="grid gap-4">
            <Skeleton width="40%" />
            <Skeleton shape="block" height={72} />
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} as="section">
              <div className="grid gap-3">
                <Skeleton width="30%" />
                <Skeleton />
                <Skeleton width="80%" />
              </div>
            </Card>
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}
