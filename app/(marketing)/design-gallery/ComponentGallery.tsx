"use client";

import { useState } from "react";
import {
  BellIcon,
  BottomTabBar,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  HomeIcon,
  Modal,
  ProgressRing,
  ReceiptIcon,
  Sheet,
  Sidebar,
  SuccessState,
  TimelinePills,
  UserIcon,
  WalletIcon,
} from "@/components/ui";
import type { DataColumn, NavItem, TimelineItem } from "@/components/ui";

/* Sample content for the gallery only. Amounts and dates are placeholders for layout, never shown outside this dev page. */

const navItems: NavItem[] = [
  { href: "#home", label: "Home", icon: <HomeIcon />, current: true },
  { href: "#pay", label: "Pay", icon: <WalletIcon />, preview: "hover" },
  { href: "#history", label: "History", icon: <ReceiptIcon />, preview: "pressed" },
  { href: "#alerts", label: "Alerts", icon: <BellIcon />, badge: 3, preview: "focus" },
  { href: "#me", label: "Profile", icon: <UserIcon />, disabled: true },
];

const timeline: TimelineItem[] = [
  { id: "a", date: "Paid date", label: "Instalment 1", status: "paid" },
  { id: "b", date: "Past due date", label: "Instalment 2", status: "overdue" },
  { id: "c", date: "Awaiting check", label: "Instalment 3", status: "pending" },
  { id: "d", date: "Next due date", label: "Instalment 4", status: "upcoming", current: true },
  { id: "e", date: "Later date", label: "Instalment 5", status: "upcoming", preview: "hover" },
];

interface Row {
  id: string;
  reference: string;
  amount: string;
  status: string;
}

const rows: Row[] = [
  { id: "1", reference: "Instalment 1", amount: "Amount", status: "Paid" },
  { id: "2", reference: "Instalment 2", amount: "Amount", status: "Pending" },
  { id: "3", reference: "Instalment 3", amount: "Amount", status: "Overdue" },
];

const columns: DataColumn<Row>[] = [
  { key: "reference", header: "Reference", cell: (r) => r.reference, primary: true },
  { key: "amount", header: "Amount", cell: (r) => r.amount, align: "end" },
  { key: "status", header: "Status", cell: (r) => r.status },
];

function Block({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4" aria-labelledby={id}>
      <h2 id={id} className="text-2xl">
        {title}
      </h2>
      {note ? <p className="text-sm text-ink-muted">{note}</p> : null}
      {children}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 rounded-lg border border-ink/10 bg-surface p-4">
      <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

export function ComponentGallery() {
  const [modal, setModal] = useState(false);
  const [busyModal, setBusyModal] = useState(false);
  const [sheet, setSheet] = useState<false | "bottom" | "end">(false);
  const [tableMode, setTableMode] = useState<"data" | "loading" | "error" | "empty">("data");

  return (
    <>
      <Block id="gallery-states" title="Empty, error, success" note="Error is announced at once. Success politely. Each tone has its own icon shape.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Panel title="Empty">
            <EmptyState compact headingLevel={3} title="No payments yet" action={<Button variant="secondary">Make a payment</Button>}>
              Payments you make will show here.
            </EmptyState>
          </Panel>
          <Panel title="Error">
            <ErrorState compact headingLevel={3} title="Payment failed" action={<Button>Try again</Button>}>
              No money left your account. Check your card details and try again.
            </ErrorState>
          </Panel>
          <Panel title="Success">
            <SuccessState compact headingLevel={3} title="Payment received">
              Your receipt is ready.
            </SuccessState>
          </Panel>
        </div>
      </Block>

      <Block id="gallery-overlay" title="Modal and sheet" note="Escape, backdrop and close button dismiss. While busy, all three are locked. Focus stays inside and returns to the button.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setSheet("bottom")}>
            Open bottom sheet
          </Button>
          <Button variant="secondary" onClick={() => setSheet("end")}>
            Open side sheet (wide screens)
          </Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          busy={busyModal}
          busyLabel="Confirming"
          title="Confirm contribution"
          description="This is a gallery sample. Nothing is charged."
          footer={
            <>
              <Button variant="quiet" onClick={() => setModal(false)} disabled={busyModal}>
                Cancel
              </Button>
              <Button
                status={busyModal ? "loading" : "idle"}
                loadingLabel="Confirming"
                onClick={() => {
                  setBusyModal(true);
                  window.setTimeout(() => {
                    setBusyModal(false);
                    setModal(false);
                  }, 1500);
                }}
              >
                Confirm
              </Button>
            </>
          }
        >
          <p>Try Escape or the backdrop while it is confirming. They do nothing until it finishes.</p>
        </Modal>
        <Sheet
          open={sheet !== false}
          side={sheet === "end" ? "end" : "bottom"}
          onClose={() => setSheet(false)}
          title="More"
          description="Longer menus and tasks go in a sheet."
          footer={<Button onClick={() => setSheet(false)}>Done</Button>}
        >
          <p>Sheet content.</p>
        </Sheet>
      </Block>

      <Block id="gallery-nav" title="Navigation" note="Same black pill for the current page. Items below show idle, current, hover, pressed, focus and disabled.">
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <Sidebar label="Gallery sidebar" items={navItems} header={<strong>Sidebar</strong>} />
          <div className="grid content-start gap-3">
            <p className="text-sm text-ink-muted">Bottom tab bar (shown inline here, fixed to the screen in the app).</p>
            <BottomTabBar label="Gallery tabs" items={navItems} placement="inline" />
          </div>
        </div>
      </Block>

      <Block id="gallery-timeline" title="Timeline pills" note="Vertical list on phones, a row from 768 px. The black pill is the next due item. Status is icon plus word.">
        <TimelinePills label="Sample schedule" items={timeline} onSelect={() => {}} />
      </Block>

      <Block id="gallery-ring" title="Progress ring" note="Only for a real ratio. The parent sets loading, success and failure.">
        <div className="flex flex-wrap items-start gap-8 rounded-lg border border-ink/10 bg-surface p-4">
          <ProgressRing value={42} max={60} label="Sample collection" caption="42 of 60" />
          <ProgressRing value={60} max={60} label="Sample complete" caption="Complete" status="success" successLabel="Complete" />
          <ProgressRing value={0} label="Sample loading" status="loading" loadingLabel="Loading" caption="Loading" />
          <ProgressRing value={0} label="Sample failed" status="failure" failureLabel="Could not load" caption="Could not load" />
          <ProgressRing value={70} label="Large sample" size="lg" caption="Large" />
        </div>
      </Block>

      <Block id="gallery-table" title="Data table" note="A table from 768 px, cards below it. Resize the window to see both.">
        <div className="flex flex-wrap gap-2">
          {(["data", "loading", "error", "empty"] as const).map((mode) => (
            <Button key={mode} variant={tableMode === mode ? "primary" : "secondary"} onClick={() => setTableMode(mode)}>
              {mode}
            </Button>
          ))}
        </div>
        <DataTable
          caption="Sample payments"
          columns={columns}
          rows={tableMode === "empty" ? [] : rows}
          getRowId={(r) => r.id}
          loading={tableMode === "loading"}
          error={tableMode === "error" ? "Sample error. No money moved." : undefined}
          onRetry={() => setTableMode("data")}
          emptyTitle="No payments yet"
          emptyText="Payments you make will show here."
        />
      </Block>
    </>
  );
}
