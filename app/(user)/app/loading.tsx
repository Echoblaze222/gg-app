import { Card, Skeleton, SkeletonGroup } from "@/components/ui";

export default function Loading() {
  return (
    <SkeletonGroup label="Loading your dashboard">
      <div className="page-head">
        <Skeleton width="40%" height={32} />
      </div>
      <div className="bento">
        <Card tone="ink" className="bento__wide">
          <div className="tile">
            <Skeleton width="30%" />
            <Skeleton width="50%" height={40} />
            <Skeleton shape="block" height={48} width={220} />
          </div>
        </Card>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className={i === 1 || i === 3 ? "bento__wide" : undefined}>
            <div className="tile">
              <Skeleton width="40%" />
              <Skeleton shape="block" height={96} />
            </div>
          </Card>
        ))}
      </div>
    </SkeletonGroup>
  );
}
