"use client";
import { Button } from "@texturehq/edges";
import { useFormStatus } from "react-dom";

export function ReviewButton({ decision, children }: { decision: "approve" | "reject"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      isDisabled={pending}
      type="submit"
      name="decision"
      value={decision}
      variant={decision === "reject" ? "secondary" : "primary"}
    >
      {children}
    </Button>
  );
}
