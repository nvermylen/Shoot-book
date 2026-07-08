"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Pill } from "@/components/primitives";
import type {
  InvoiceListRow,
  UninvoicedBooking,
} from "@/lib/erp/invoice";
import {
  createInvoiceAction,
  recordPaymentAction,
  deletePaymentAction,
  cancelInvoiceAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Money + date rendering. Cents everywhere except these two functions.
// ---------------------------------------------------------------------------

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** Parse a user-typed dollar amount to integer cents; null when invalid. */
function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}

function shortDate(dateStr: string, timezone: string): string {
  // due_date is date-only (YYYY-MM-DD) — render as a calendar date, no tz math.
  // Timestamps get formatted in the photographer's timezone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = dateOnly ? new Date(`${dateStr}T12:00:00Z`) : new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: dateOnly ? "UTC" : timezone,
  });
}

function localMonthKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
}

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  final: "Final",
  addon: "Add-on",
  refund: "Refund",
};

// ---------------------------------------------------------------------------

export function PaymentsTable({
  invoices,
  timezone,
  uninvoiced,
}: {
  invoices: InvoiceListRow[];
  timezone: string;
  uninvoiced: UninvoicedBooking[];
}) {
  const [tab, setTab] = useState<"outstanding" | "paid" | "all">("outstanding");
  const [newInvoiceFor, setNewInvoiceFor] = useState<UninvoicedBooking | null | "pick">(null);
  const [payingInvoice, setPayingInvoice] = useState<InvoiceListRow | null>(null);

  const stats = useMemo(() => {
    const open = invoices.filter((i) => i.status === "sent" || i.status === "partial");
    const nowMonth = localMonthKey(new Date().toISOString(), timezone);
    const paidMTD = invoices
      .flatMap((i) => i.payments)
      .filter((p) => localMonthKey(p.received_at, timezone) === nowMonth)
      .reduce((sum, p) => sum + p.amount_cents, 0);
    return {
      outstanding: open.reduce((sum, i) => sum + i.balance_cents, 0),
      overdue: open
        .filter((i) => i.is_overdue)
        .reduce((sum, i) => sum + i.balance_cents, 0),
      paidMTD,
    };
  }, [invoices, timezone]);

  const rows = useMemo(() => {
    if (tab === "outstanding")
      return invoices.filter((i) => i.status === "sent" || i.status === "partial");
    if (tab === "paid") return invoices.filter((i) => i.status === "paid");
    return invoices;
  }, [invoices, tab]);

  const statusPill = (r: InvoiceListRow) => {
    if (r.is_overdue)
      return (
        <Pill kind="danger" dot>
          {r.days_overdue}d overdue
        </Pill>
      );
    if (r.status === "partial") return <Pill kind="info" dot>Partial</Pill>;
    if (r.status === "sent") return <Pill kind="warn" dot>Open</Pill>;
    if (r.status === "paid") return <Pill kind="success" dot>Paid</Pill>;
    if (r.status === "cancelled") return <Pill kind="neutral">Cancelled</Pill>;
    return <Pill kind="neutral">Draft</Pill>;
  };

  const routedToParent = (r: InvoiceListRow) =>
    r.client.parent_email !== null && r.recipient_email === r.client.parent_email;

  return (
    <div data-page="payments">
      <div style={{ padding: "32px 56px 20px", borderBottom: "1px solid var(--rule)" }}>
        <div className="eyebrow">Billing</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h1 className="display" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 500 }}>
            Payments
          </h1>
          <button
            className="btn primary"
            data-testid="new-invoice-btn"
            onClick={() => setNewInvoiceFor("pick")}
          >
            <Plus size={13} /> New invoice
          </button>
        </div>
      </div>

      {/* Stats — real aggregates, cents formatted at render */}
      <div style={{ padding: "24px 56px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {(
            [
              ["Outstanding", stats.outstanding, "var(--accent)", "stat-outstanding"],
              ["Overdue", stats.overdue, "var(--danger)", "stat-overdue"],
              ["Paid MTD", stats.paidMTD, "var(--success)", "stat-paid-mtd"],
            ] as const
          ).map(([label, cents, color, testId]) => (
            <div
              key={label}
              className="card"
              data-testid={testId}
              style={{ padding: "16px 20px", borderColor: color }}
            >
              <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
              <div className="stat-num" style={{ fontSize: 32, color }}>
                {dollars(cents)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {invoices.length === 0 ? (
        <CutoverAssist uninvoiced={uninvoiced} timezone={timezone} onAdd={setNewInvoiceFor} />
      ) : (
        <>
          {/* Tabs */}
          <div style={{ padding: "16px 56px 0", display: "flex", gap: 6 }}>
            {(
              [
                ["outstanding", "Outstanding"],
                ["paid", "Paid"],
                ["all", "All"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                data-testid={`payments-tab-${k}`}
                className={`chip ${tab === k ? "active" : ""}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div style={{ padding: "20px 56px 56px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
            {/* Table */}
            <div className="card" style={{ overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px 110px 110px 90px 130px 170px",
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--rule)",
                  background: "var(--paper-2)",
                  alignItems: "center",
                }}
              >
                <div className="eyebrow">Client</div>
                <div className="eyebrow">Invoice</div>
                <div className="eyebrow">Balance</div>
                <div className="eyebrow">Due</div>
                <div className="eyebrow">Reminders</div>
                <div className="eyebrow">Status</div>
                <div />
              </div>

              {rows.length === 0 && (
                <div
                  data-testid="payments-tab-empty"
                  style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}
                >
                  Nothing here.
                </div>
              )}

              {rows.map((r, i) => (
                <div
                  key={r.id}
                  data-testid={`invoice-row-${r.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 150px 110px 110px 90px 130px 170px",
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.client.display_name}</div>
                    <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>
                      → {routedToParent(r)
                        ? `${r.client.parent_name ?? r.client.parent_email} (parent)`
                        : r.recipient_email}
                    </div>
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.booking.session_date
                      ? ` · ${shortDate(r.booking.session_date, timezone)}`
                      : ""}
                  </span>
                  <span className="num" style={{ fontWeight: 500 }}>
                    {dollars(r.status === "paid" || r.status === "cancelled" ? r.amount_cents : r.balance_cents)}
                  </span>
                  <span className="meta">{shortDate(r.due_date, timezone)}</span>
                  <span className="meta num">{r.reminders_sent}</span>
                  <div>{statusPill(r)}</div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {(r.status === "sent" || r.status === "partial") && (
                      <>
                        <button
                          className="btn sm"
                          data-testid={`record-payment-btn-${r.id}`}
                          onClick={() => setPayingInvoice(r)}
                        >
                          Record payment
                        </button>
                        <CancelInvoiceButton invoice={r} />
                      </>
                    )}
                    {r.status === "paid" && r.payments.length > 0 && (
                      <button
                        className="btn sm ghost"
                        data-testid={`view-payments-btn-${r.id}`}
                        onClick={() => setPayingInvoice(r)}
                      >
                        Payments
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Right rail — honest state only */}
            <div>
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Routing</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  Invoices go to the parent when one is on file, otherwise to the
                  client. Add a parent from the client drawer and future invoices
                  route there automatically.
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Payment chase</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  Automated reminders are not running yet — they arrive with the
                  payment chase (LENS-022e). Reminder counts shown are real sends
                  logged so far.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {newInvoiceFor !== null && (
        <NewInvoiceDialog
          uninvoiced={uninvoiced}
          preselected={newInvoiceFor === "pick" ? null : newInvoiceFor}
          timezone={timezone}
          onClose={() => setNewInvoiceFor(null)}
        />
      )}
      {payingInvoice !== null && (
        <RecordPaymentDialog
          invoice={payingInvoice}
          timezone={timezone}
          onClose={() => setPayingInvoice(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cutover assist (Rule 3 — never open empty): zero invoices is a migration
// prompt seeded from bookings she already has, not a blank slate.
// ---------------------------------------------------------------------------

function CutoverAssist({
  uninvoiced,
  timezone,
  onAdd,
}: {
  uninvoiced: UninvoicedBooking[];
  timezone: string;
  onAdd: (b: UninvoicedBooking | "pick") => void;
}) {
  return (
    <div style={{ padding: "24px 56px 56px" }}>
      <div className="card" data-testid="payments-cutover-assist" style={{ padding: 24 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>
          {uninvoiced.length > 0
            ? `${uninvoiced.length} upcoming ${uninvoiced.length === 1 ? "shoot has" : "shoots have"} no invoice on file`
            : "No invoices yet"}
        </div>
        <div className="meta" style={{ marginTop: 4, fontSize: 12.5 }}>
          {uninvoiced.length > 0
            ? "Bring your open book into Lens — add the invoices you've already sent so the morning sweep can answer “who owes me.”"
            : "When a booking is on the calendar, it will appear here so you can add its invoices."}
        </div>

        {uninvoiced.map((b, i) => (
          <div
            key={b.id}
            data-testid={`cutover-booking-${b.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderTop: i === 0 ? "1px solid var(--rule)" : undefined,
              borderBottom: "1px solid var(--rule)",
              marginTop: i === 0 ? 16 : 0,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{b.client.display_name}</div>
              <div className="meta" style={{ fontSize: 11 }}>
                {b.package?.name ?? "No package"}
                {b.session_date ? ` · ${shortDate(b.session_date, timezone)}` : " · date TBD"}
              </div>
            </div>
            <button
              className="btn sm"
              data-testid={`cutover-add-invoice-${b.id}`}
              onClick={() => onAdd(b)}
            >
              <Plus size={12} /> Add invoice
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function DialogShell({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={`${testId}-overlay`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.2 0.005 250 / 0.35)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 440, maxHeight: "85vh", overflowY: "auto", padding: 24, background: "var(--paper)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 15 }}>{title}</div>
          <button className="btn sm ghost" data-testid={`${testId}-close`} onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "var(--paper-2)",
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

function NewInvoiceDialog({
  uninvoiced,
  preselected,
  timezone,
  onClose,
}: {
  uninvoiced: UninvoicedBooking[];
  preselected: UninvoicedBooking | null;
  timezone: string;
  onClose: () => void;
}) {
  const [bookingId, setBookingId] = useState(preselected?.id ?? uninvoiced[0]?.id ?? "");
  const booking = uninvoiced.find((b) => b.id === bookingId) ?? null;
  const [kind, setKind] = useState<"deposit" | "final" | "addon">("deposit");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Routing rule made visible: parent when on file, else client — with the why.
  const routedDefault = booking
    ? booking.client.parent_email ?? booking.client.email
    : "";
  const routingReason = booking
    ? booking.client.parent_email
      ? `${booking.client.parent_name ?? booking.client.parent_email} — parent on file`
      : "no parent on file — goes to the client"
    : "";
  const effectiveRecipient = recipientTouched ? recipient : routedDefault;

  const suggestedCents =
    booking?.package && kind === "deposit"
      ? booking.package.deposit_cents
      : booking?.package && kind === "final"
        ? booking.package.price_cents - booking.package.deposit_cents
        : null;

  const submit = () => {
    setError(null);
    const cents = parseDollarsToCents(amount);
    if (!booking) return setError("Pick a booking.");
    if (cents === null) return setError("Enter a valid amount.");
    if (!dueDate) return setError("Pick a due date.");

    startTransition(async () => {
      const result = await createInvoiceAction({
        booking_id: booking.id,
        kind,
        amount_cents: cents,
        due_date: dueDate,
        recipient_email:
          recipientTouched && recipient.trim() !== "" && recipient !== routedDefault
            ? recipient.trim()
            : undefined,
      });
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      onClose();
    });
  };

  return (
    <DialogShell title="New invoice" onClose={onClose} testId="new-invoice-dialog">
      <Field label="Booking">
        <select
          style={fieldStyle}
          value={bookingId}
          data-testid="new-invoice-booking"
          onChange={(e) => {
            setBookingId(e.target.value);
            setRecipientTouched(false);
          }}
        >
          {uninvoiced.length === 0 && <option value="">No upcoming bookings without an invoice</option>}
          {uninvoiced.map((b) => (
            <option key={b.id} value={b.id}>
              {b.client.display_name}
              {b.session_date ? ` — ${shortDate(b.session_date, timezone)}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Type">
        <select
          style={fieldStyle}
          value={kind}
          data-testid="new-invoice-kind"
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="deposit">Deposit</option>
          <option value="final">Final</option>
          <option value="addon">Add-on</option>
        </select>
      </Field>

      <Field label="Amount (USD)">
        <input
          style={fieldStyle}
          value={amount}
          placeholder={suggestedCents ? dollars(suggestedCents) : "$0.00"}
          data-testid="new-invoice-amount"
          onChange={(e) => setAmount(e.target.value)}
        />
        {suggestedCents !== null && amount === "" && (
          <button
            type="button"
            className="btn sm ghost"
            data-testid="new-invoice-use-suggested"
            style={{ marginTop: 6 }}
            onClick={() => setAmount((suggestedCents / 100).toFixed(2))}
          >
            Use {dollars(suggestedCents)} from package
          </button>
        )}
      </Field>

      <Field label="Due date">
        <input
          type="date"
          style={fieldStyle}
          value={dueDate}
          data-testid="new-invoice-due-date"
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>

      <Field label="Send to">
        <input
          style={fieldStyle}
          value={effectiveRecipient}
          data-testid="new-invoice-recipient"
          onChange={(e) => {
            setRecipientTouched(true);
            setRecipient(e.target.value);
          }}
        />
        <div className="meta" style={{ fontSize: 10.5, marginTop: 4 }}>{routingReason}</div>
      </Field>

      {error && (
        <div data-testid="new-invoice-error" style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button
        className="btn primary"
        disabled={pending || !booking}
        data-testid="new-invoice-submit"
        onClick={submit}
        style={{ width: "100%" }}
      >
        {pending ? "Saving…" : "Add invoice"}
      </button>
      <div className="meta" style={{ fontSize: 10.5, marginTop: 8, textAlign: "center" }}>
        Recorded as already sent — Lens tracks it from here.
      </div>
    </DialogShell>
  );
}

function RecordPaymentDialog({
  invoice,
  timezone,
  onClose,
}: {
  invoice: InvoiceListRow;
  timezone: string;
  onClose: () => void;
}) {
  const open = invoice.status === "sent" || invoice.status === "partial";
  const [amount, setAmount] = useState(
    open ? (invoice.balance_cents / 100).toFixed(2) : "",
  );
  const [method, setMethod] = useState<"cash" | "check" | "other">("check");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const cents = parseDollarsToCents(amount);
    if (cents === null) return setError("Enter a valid amount.");

    startTransition(async () => {
      const result = await recordPaymentAction({
        invoice_id: invoice.id,
        amount_cents: cents,
        method,
      });
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      onClose();
    });
  };

  const removePayment = (paymentId: string) => {
    if (!window.confirm("Delete this payment? The invoice balance will reopen.")) return;
    startTransition(async () => {
      const result = await deletePaymentAction(paymentId);
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      onClose();
    });
  };

  return (
    <DialogShell
      title={`${invoice.client.display_name} — ${KIND_LABEL[invoice.kind] ?? invoice.kind}`}
      onClose={onClose}
      testId="record-payment-dialog"
    >
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 16 }}>
        {dollars(invoice.amount_cents)} total · {dollars(invoice.paid_cents)} received ·{" "}
        <strong>{dollars(invoice.balance_cents)} open</strong>
      </div>

      {invoice.payments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Payments</div>
          {invoice.payments.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid var(--rule)",
                fontSize: 12.5,
              }}
            >
              <span>
                {dollars(p.amount_cents)} · {p.method} · {shortDate(p.received_at, timezone)}
              </span>
              <button
                className="btn sm ghost"
                data-testid={`delete-payment-${p.id}`}
                aria-label="Delete payment"
                disabled={pending}
                onClick={() => removePayment(p.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <>
          <Field label="Amount received (USD)">
            <input
              style={fieldStyle}
              value={amount}
              data-testid="record-payment-amount"
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="Method">
            <select
              style={fieldStyle}
              value={method}
              data-testid="record-payment-method"
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other (Venmo, Zelle…)</option>
              <option value="stripe" disabled>
                Stripe — Phase 2
              </option>
            </select>
          </Field>
        </>
      )}

      {error && (
        <div data-testid="record-payment-error" style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {open && (
        <button
          className="btn primary"
          disabled={pending}
          data-testid="record-payment-submit"
          onClick={submit}
          style={{ width: "100%" }}
        >
          {pending ? "Saving…" : "Record payment"}
        </button>
      )}
    </DialogShell>
  );
}

function CancelInvoiceButton({ invoice }: { invoice: InvoiceListRow }) {
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    if (
      !window.confirm(
        `Cancel this ${KIND_LABEL[invoice.kind]?.toLowerCase() ?? ""} invoice for ${invoice.client.display_name}?`,
      )
    )
      return;
    startTransition(async () => {
      await cancelInvoiceAction(invoice.id);
    });
  };

  return (
    <button
      className="btn sm ghost"
      data-testid={`cancel-invoice-btn-${invoice.id}`}
      disabled={pending}
      onClick={cancel}
    >
      Cancel
    </button>
  );
}
