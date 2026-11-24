"use client";

import { Icon } from "@texturehq/edges";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmRecordPanel } from "./ConfirmRecordPanel";

interface ConfirmRecordActionProps {
  utilitySlug: string;
  utilityName: string;
  /** Called once a confirmation is saved. */
  onConfirmed?: () => void;
}

/**
 * "Work here? Confirm this record" link for a utility page, on its own line
 * under the header: the header's button row has no room left on phones.
 *
 * `?confirm=true` opens the drawer, the way `?edit=true` opens Suggest Edit,
 * so outreach can send one plain link per utility. Unlike Suggest Edit it
 * opens for signed-out visitors too: the drawer asks them to sign in.
 */
export function ConfirmRecordAction({ utilitySlug, utilityName, onConfirmed }: ConfirmRecordActionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current || searchParams.get("confirm") !== "true") return;
    didAutoOpen.current = true;
    setIsOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("confirm");
    window.history.replaceState({}, "", url.toString());
  }, [searchParams]);

  // Suggest Edit opens itself from ?edit=true (see EntityActions).
  const handOffToSuggestEdit = () => {
    setIsOpen(false);
    router.replace(`${pathname}?edit=true`, { scroll: false });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-sm text-text-body underline decoration-border-default underline-offset-4 hover:text-text-heading"
      >
        <Icon name="SealCheck" size={14} />
        Work here? Confirm this record
      </button>
      {isOpen && (
        <ConfirmRecordPanel
          utilitySlug={utilitySlug}
          utilityName={utilityName}
          onClose={() => setIsOpen(false)}
          onSuggestEdit={handOffToSuggestEdit}
          onSaved={onConfirmed}
        />
      )}
    </>
  );
}
