/**
 * lib/contributions/edit-summary.ts
 *
 * Single source of truth for the community edit-summary length floor.
 *
 * Why this file exists: the API rejected summaries shorter than 25 characters
 * while the submit form's counter rendered "x/10" and enabled the submit button
 * at 10. A contributor who wrote a 12-character summary saw a green,
 * apparently-valid form, pressed Submit, and got a validation error for a rule
 * the UI never showed them. The number now lives in one place so the counter,
 * the client-side gate, and the server-side check cannot disagree again.
 */

/** Minimum characters (after trim) required in a contribution's edit summary. */
export const EDIT_SUMMARY_MIN_LENGTH = 25;
