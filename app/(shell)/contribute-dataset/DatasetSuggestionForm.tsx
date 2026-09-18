"use client";

import { Banner, Button, Switch, TextArea, TextField } from "@texturehq/edges";
import { useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  submitterEmail: string;
  submitterName: string;
  datasetName: string;
  dataDescription: string;
  usefulness: string;
  source: string;
  willingToModerate: boolean;
}

const INITIAL_VALUES: FormValues = {
  submitterEmail: "",
  submitterName: "",
  datasetName: "",
  dataDescription: "",
  usefulness: "",
  source: "",
  willingToModerate: false,
};

/** Client-side gate mirroring the endpoint's required-field + email checks. */
function validate(values: FormValues): string | null {
  if (!values.submitterEmail.trim()) return "Please add an email so a moderator can follow up.";
  if (!EMAIL_RE.test(values.submitterEmail.trim())) return "That email address doesn't look right.";
  if (!values.datasetName.trim()) return "Please give the dataset a name.";
  if (!values.dataDescription.trim()) return "Please describe what kind of data this represents.";
  if (!values.usefulness.trim()) return "Please tell us why it's useful to CommonGrid.";
  return null;
}

export function DatasetSuggestionForm() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validate(values);
    if (validationError) {
      setState("error");
      setError(validationError);
      return;
    }

    setState("submitting");

    try {
      const res = await fetch("/api/v1/dataset-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submitterEmail: values.submitterEmail.trim(),
          submitterName: values.submitterName.trim() || undefined,
          datasetName: values.datasetName.trim(),
          dataDescription: values.dataDescription.trim(),
          usefulness: values.usefulness.trim(),
          source: values.source.trim() || undefined,
          willingToModerate: values.willingToModerate,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setState("error");
        setError(
          payload?.error?.message ?? "Something went wrong submitting your suggestion. Please try again in a moment."
        );
        return;
      }

      setState("success");
      setValues(INITIAL_VALUES);
    } catch {
      setState("error");
      setError("We couldn't reach the server. Please check your connection and try again.");
    }
  }

  if (state === "success") {
    return (
      <Banner variant="success" title="Thanks — your suggestion is in.">
        A moderator will review it and reach out to you about sourcing and next steps. Have another dataset in mind? You
        can submit as many as you like.
      </Banner>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {state === "error" && error && (
        <Banner variant="error" title="Please fix the following">
          {error}
        </Banner>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Your email"
          type="email"
          isRequired
          value={values.submitterEmail}
          onChange={(next) => update("submitterEmail", next)}
          placeholder="you@example.com"
          description="So a moderator can follow up with you."
        />
        <TextField
          label="Your name (optional)"
          value={values.submitterName}
          onChange={(next) => update("submitterName", next)}
          placeholder="Jane Rivera"
        />
      </div>

      <TextField
        label="Dataset name"
        isRequired
        value={values.datasetName}
        onChange={(next) => update("datasetName", next)}
        placeholder="e.g. Interconnection queue positions"
      />

      <TextArea
        label="What kind of data does it represent?"
        required
        value={values.dataDescription}
        onChange={(e) => update("dataDescription", e.target.value)}
        rows={4}
        placeholder="Describe the entities, fields, coverage, and granularity."
      />

      <TextArea
        label="Why is it useful to CommonGrid?"
        required
        value={values.usefulness}
        onChange={(e) => update("usefulness", e.target.value)}
        rows={4}
        placeholder="How would it connect to what's already in the graph, and who would it help?"
      />

      <TextArea
        label="Source (optional)"
        value={values.source}
        onChange={(e) => update("source", e.target.value)}
        rows={2}
        placeholder="A link or a short description of where the data comes from."
        description="Public sources are easiest to accept, but tell us whatever you know."
      />

      <div className="rounded-md border border-border-default bg-background-surface p-4">
        <Switch isSelected={values.willingToModerate} onChange={(next) => update("willingToModerate", next)}>
          I&rsquo;d be willing to help moderate this dataset.
        </Switch>
        <p className="mt-1.5 text-sm text-text-muted">
          Moderators review edits for accuracy and sourcing. Volunteering isn&rsquo;t required to suggest a dataset.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={state === "submitting"}>
          {state === "submitting" ? "Submitting…" : "Submit suggestion"}
        </Button>
        <span className="text-sm text-text-muted">No account needed.</span>
      </div>
    </form>
  );
}
