"use client";

import { SignInButton } from "@clerk/nextjs";
import { Badge, Banner, Button, Dialog, Drawer, Icon, Loader, TextArea } from "@texturehq/edges";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EDIT_ENTITY_DRAWER_CLASSNAME } from "@/components/contributions/editEntityPanelLayout";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { type ConfirmRow, confirmedLine } from "@/lib/confirmations/record";

interface ConfirmData {
  utility: { id: string; slug: string; name: string; confirmerName: string };
  rows: ConfirmRow[];
  viewer: { emailDomain: string | null; canConfirm: boolean };
}

type Step = "rows" | "confirm" | "done";

interface ConfirmRecordPanelProps {
  utilitySlug: string;
  utilityName: string;
  onClose: () => void;
  /** Hand off to Suggest Edit for this utility. */
  onSuggestEdit: () => void;
}

/**
 * "Confirm record" as a drawer, built like Suggest Edit's EditEntityPanel:
 * the drawer lists what CommonGrid has, a dialog replaces it for the last look
 * before sending, and the drawer comes back for what happens next.
 *
 * Opens for signed-out visitors too, with a sign-in prompt, because the usual
 * way in is a shared `?confirm=true` link.
 */
export function ConfirmRecordPanel({ utilitySlug, utilityName, onClose, onSuggestEdit }: ConfirmRecordPanelProps) {
  const { user, isLoading: userLoading } = useCurrentUser();
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>("rows");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [changedNotice, setChangedNotice] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    fetch(`/api/v1/confirmations/${encodeURIComponent(utilitySlug)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load this record. Try again in a moment.");
        return (await res.json()).data as ConfirmData;
      })
      .then(setData)
      .catch((err: Error) => setLoadError(err.message));
  }, [utilitySlug]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const toConfirm = useMemo(() => (data?.rows ?? []).filter((r) => r.value && !wrong.has(r.key)), [data, wrong]);
  const flagged = useMemo(() => (data?.rows ?? []).filter((r) => wrong.has(r.key) || !r.value), [data, wrong]);

  const toggleWrong = (key: string) =>
    setWrong((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/v1/confirmations/${encodeURIComponent(utilitySlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: toConfirm.map((r) => ({
            entityType: r.entityType,
            entityId: r.entityId,
            fieldName: r.fieldName,
            value: r.value,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 409) {
        // Something changed since the drawer opened: show the latest values and let them check again.
        setChangedNotice(true);
        setData(null);
        load();
        setStep("rows");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message ?? "That didn't go through. Try again.");
      setConfirmedAt(json.data.confirmedAt);
      setSavedCount(json.data.saved);
      setChangedNotice(false);
      setStep("done");
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmerName = data?.utility.confirmerName ?? utilityName;

  // Step 2 replaces the drawer, as in Suggest Edit: one modal surface at a time.
  if (step === "confirm" && data) {
    const preview = confirmedLine(confirmerName, new Date().toISOString());
    return (
      <Dialog
        isOpen
        onClose={() => setStep("rows")}
        title="Confirm these details"
        hasBackArrow
        onBack={() => setStep("rows")}
        secondaryAction={{ label: "Back", onPress: () => setStep("rows"), isDisabled: isSubmitting }}
        primaryAction={{ label: "Confirm", onPress: submit, isDisabled: isSubmitting, isLoading: isSubmitting }}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border-default bg-background-muted p-3">
            <div className="text-sm font-medium text-text-heading">{data.utility.name}</div>
            <ul className="mt-2 space-y-1 text-sm text-text-body">
              {toConfirm.map((r) => (
                <li key={r.key}>
                  • {r.label}: <span className="text-text-muted">{r.displayValue}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-text-body">
            <p>This will show publicly on CommonGrid, beside each detail you confirm:</p>
            <p className="mt-1 font-medium text-text-heading">{preview}</p>
            <p className="mt-2 text-text-muted">Your name and email won't be shown.</p>
          </div>
          {submitError && <Banner variant="error">{submitError}</Banner>}
        </div>
      </Dialog>
    );
  }

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (!user && !userLoading) {
    body = (
      <div className="space-y-4 text-sm text-text-body">
        <p>
          Work at {utilityName}? Sign in with your work email to confirm what CommonGrid lists for you. It takes about a
          minute.
        </p>
        <SignInButton mode="modal">
          <Button variant="primary" size="md">
            Sign in
          </Button>
        </SignInButton>
      </div>
    );
  } else if (loadError) {
    body = <Banner variant="error">{loadError}</Banner>;
  } else if (!data) {
    body = (
      <div className="flex justify-center py-12">
        <Loader />
      </div>
    );
  } else if (step === "done") {
    body = (
      <DoneStep
        data={data}
        requestedCount={toConfirm.length}
        savedCount={savedCount}
        confirmedAt={confirmedAt}
        flagged={flagged}
        onSuggestEdit={onSuggestEdit}
      />
    );
    footer = (
      <div className="flex justify-end">
        <Button variant="primary" size="md" onPress={onClose}>
          Done
        </Button>
      </div>
    );
  } else {
    const canConfirm = data.viewer.canConfirm;
    body = (
      <div className="space-y-4">
        {changedNotice && (
          <Banner variant="warning">
            Some of this record changed while you were looking. Here's the latest. Check it again, then confirm.
          </Banner>
        )}
        {canConfirm ? (
          <p className="text-sm text-text-body">
            Here's what CommonGrid lists for {data.utility.name}. Mark anything that's wrong, then confirm the rest.
          </p>
        ) : (
          <Banner variant="info">
            <p>
              Only someone signed in with a verified {data.utility.name} email can confirm this record
              {data.viewer.emailDomain ? `. You're signed in with a ${data.viewer.emailDomain} address.` : "."}
            </p>
            <p className="mt-2">
              You can still{" "}
              <button type="button" className="text-brand-primary underline" onClick={onSuggestEdit}>
                suggest an edit
              </button>
              .
            </p>
          </Banner>
        )}
        <ul className="divide-y divide-border-muted rounded-lg border border-border-default">
          {data.rows.map((row) => (
            <RowItem
              key={row.key}
              row={row}
              confirmerName={confirmerName}
              isWrong={wrong.has(row.key)}
              canConfirm={canConfirm}
              onToggleWrong={() => toggleWrong(row.key)}
            />
          ))}
        </ul>
      </div>
    );
    if (canConfirm) {
      const next = toConfirm.length > 0 ? () => setStep("confirm") : () => setStep("done");
      footer = (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            {toConfirm.length === 0
              ? "Nothing left to confirm."
              : toConfirm.length === 1
                ? "1 detail to confirm."
                : `${toConfirm.length} details to confirm.`}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" size="md" onPress={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={next}
              isDisabled={toConfirm.length === 0 && flagged.length === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      );
    }
  }

  return (
    <Drawer isOpen onClose={onClose} className={EDIT_ENTITY_DRAWER_CLASSNAME}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border-default p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-text-heading">Confirm record</h2>
            <p className="truncate text-sm text-text-muted">{utilityName}</p>
          </div>
          <Button variant="ghost" size="sm" onPress={onClose} className="ml-2 flex-shrink-0" aria-label="Close">
            <Icon name="X" size="sm" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{body}</div>
        {footer && <div className="border-t border-border-default p-4">{footer}</div>}
      </div>
    </Drawer>
  );
}

function RowItem({
  row,
  confirmerName,
  isWrong,
  canConfirm,
  onToggleWrong,
}: {
  row: ConfirmRow;
  confirmerName: string;
  isWrong: boolean;
  canConfirm: boolean;
  onToggleWrong: () => void;
}) {
  const missing = !row.value;
  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-text-muted">{row.entityType === "program" ? "Program" : row.label}</div>
        <div className="break-words text-sm font-medium text-text-heading">
          {row.entityType === "program" ? (
            row.label
          ) : missing ? (
            <span className="italic text-text-muted">Missing</span>
          ) : (
            row.displayValue
          )}
        </div>
        {row.entityType === "program" && (
          <div className="text-sm text-text-body">{row.displayValue ?? "No status"}</div>
        )}
        {row.lastConfirmedAt && !isWrong && (
          <div className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            <Icon name="SealCheck" size={12} />
            {confirmedLine(confirmerName, row.lastConfirmedAt)}
          </div>
        )}
      </div>
      {canConfirm && (
        <div className="flex-shrink-0 text-right">
          {missing ? (
            <span className="text-xs text-text-muted">Add it next</span>
          ) : isWrong ? (
            <div className="flex flex-col items-end gap-1">
              <Badge variant="warning" size="sm" shape="pill">
                Marked wrong
              </Badge>
              <button type="button" className="text-xs text-text-muted underline" onClick={onToggleWrong}>
                Undo
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm text-brand-primary underline" onClick={onToggleWrong}>
              Something's wrong
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function details(n: number): string {
  return n === 1 ? "1 detail" : `${n} details`;
}

/** Counts what the server actually saved, so a repeat doesn't read as new. */
export function thanksLine(requested: number, saved: number): string {
  if (saved === 0) return "Thanks. You'd already confirmed this today.";
  if (saved < requested) return `Thanks. ${details(saved)} confirmed; the rest you'd already confirmed today.`;
  return `Thanks. ${details(saved)} confirmed.`;
}

function DoneStep({
  data,
  requestedCount,
  savedCount,
  confirmedAt,
  flagged,
  onSuggestEdit,
}: {
  data: ConfirmData;
  /** Details the person confirmed. */
  requestedCount: number;
  /** Rows the server saved; repeats within 24 hours aren't saved again. */
  savedCount: number;
  confirmedAt: string | null;
  flagged: ConfirmRow[];
  onSuggestEdit: () => void;
}) {
  return (
    <div className="space-y-5 text-sm text-text-body">
      {requestedCount > 0 && confirmedAt && (
        <Banner variant="success" title={thanksLine(requestedCount, savedCount)}>
          {confirmedLine(data.utility.confirmerName, confirmedAt)}
        </Banner>
      )}
      {flagged.length > 0 && (
        <div className="space-y-3">
          <p className="font-medium text-text-heading">What's wrong or missing</p>
          {flagged.map((row) => (
            <FollowUp key={row.key} row={row} utilityId={data.utility.id} onSuggestEdit={onSuggestEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUp({
  row,
  utilityId,
  onSuggestEdit,
}: {
  row: ConfirmRow;
  utilityId: string;
  onSuggestEdit: () => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const what = row.value ? "wrong" : "missing";

  if (row.handoff.kind === "suggest_edit") {
    return (
      <div className="rounded-lg border border-border-default p-3">
        <p>
          {row.label} is {what}.
        </p>
        <Button variant="secondary" size="sm" className="mt-2" onPress={onSuggestEdit}>
          Suggest an edit
        </Button>
      </div>
    );
  }

  if (row.handoff.kind === "program_page") {
    return (
      <div className="rounded-lg border border-border-default p-3">
        <p>{row.label} has changed or ended.</p>
        <p className="mt-1 text-text-muted">Open the program and use Suggest Edit to update it.</p>
        <Link
          href={`/explore/programs/${row.handoff.programSlug}`}
          className="mt-2 inline-block text-brand-primary underline"
        >
          Open {row.label}
        </Link>
      </div>
    );
  }

  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/v1/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "utility",
          entity_id: utilityId,
          title: row.value ? "Power supplier needs correcting" : "Power supplier is missing",
          // Prefixed so a short answer like "TVA" still meets the discussions API's 10-character minimum.
          body: `From the confirm-record form: ${text.trim()}`,
        }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-lg border border-border-default p-3">
      <label htmlFor={`followup-${row.key}`} className="block">
        Power supplier is {what}. Who supplies your power?
      </label>
      {state === "sent" ? (
        <p className="mt-2 text-feedback-success">Saved as a discussion on this record. Thanks.</p>
      ) : (
        <>
          <div className="mt-2">
            <TextArea
              id={`followup-${row.key}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              reserveErrorSpace={false}
            />
          </div>
          <p className="mt-1 text-xs text-text-muted">This power supplier link can't be edited directly yet.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onPress={send}
            isDisabled={!text.trim() || state === "sending"}
          >
            Send
          </Button>
          {state === "error" && <p className="mt-1 text-feedback-error">That didn't go through. Try again.</p>}
        </>
      )}
    </div>
  );
}
