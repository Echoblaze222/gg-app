import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ErrorState } from "@/components/features/dashboard/states";
import { NotificationCenter } from "@/components/features/dashboard/member/NotificationCenter";
import { NotConnected } from "@/components/features/dashboard/NotConnected";
import { RetryButton } from "@/components/features/dashboard/RetryButton";
import { buildRequestContext } from "@/lib/dashboard/context";
import { describeError } from "@/lib/dashboard/describe-error";
import { safe } from "@/lib/dashboard/safe";
import { getDashboardServices } from "@/lib/dashboard/services";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;
  const [list, unread] = await Promise.all([
    safe(ctx.requestId, () => services.notifications.list(ctx, { limit: 20, cursor: null })),
    safe(ctx.requestId, () => services.notifications.unreadCount(ctx)),
  ]);
  const error = !list.ok ? list.error : !unread.ok ? unread.error : null;
  return (
    <>
      <div className="page-head">
        <h1 className="page-head__title">Notifications</h1>
        <p className="page-head__sub">Reminders, payment updates and security alerts.</p>
      </div>
      <Card>
        {list.ok && unread.ok ? (
          <NotificationCenter initial={{ items: list.value.items, nextCursor: list.value.nextCursor, unread: unread.value }} />
        ) : (
          <ErrorState {...describeError(error!, "Your notifications did not load")} retry={<RetryButton />} />
        )}
      </Card>
    </>
  );
}
