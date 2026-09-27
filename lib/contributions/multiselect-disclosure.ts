/**
 * Whether a collapsible multi-select group should render expanded.
 *
 * A group with a value already set opens expanded, so an existing selection is
 * never hidden behind a summary the contributor has to think to open. Once the
 * contributor opens or closes a group themselves, that choice wins.
 *
 * This is a function, not a `useState` initializer, because of when the form's
 * values arrive: `useEditEntityFlow` seeds them in an effect that runs after the
 * fields first render, so at mount every field's value is still undefined. An
 * initializer would capture "nothing selected" and never reconsider once the
 * real value landed — the group would stay collapsed on an entity that had
 * values set. Deriving it on each render means the seeded value is picked up on
 * the very next one.
 */
export function isMultiSelectExpanded(params: {
  /** Null until the contributor has deliberately opened or closed the group. */
  userToggled: boolean | null;
  /** How many options are currently selected. */
  selectedCount: number;
}): boolean {
  return params.userToggled ?? params.selectedCount > 0;
}
