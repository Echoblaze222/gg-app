import { Card, Skeleton, SkeletonGroup } from "@/components/ui";

/** Shown while the member list loads. It has its own file so the members page never shows the dashboard skeleton. */
export default function AdminMembersLoading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <h1 className="font-display text-4xl leading-tight">Members</h1>
      <SkeletonGroup label="Loading the member list" className="grid gap-4">
        <Card as="section">
          <div className="grid gap-3">
            <Skeleton shape="block" height={56} />
            <Skeleton width="60%" />
          </div>
        </Card>
        <Card as="section">
          <div className="grid gap-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="grid gap-2">
                <Skeleton width="40%" />
                <Skeleton width="25%" />
              </div>
            ))}
          </div>
        </Card>
      </SkeletonGroup>
    </div>
  );
}
