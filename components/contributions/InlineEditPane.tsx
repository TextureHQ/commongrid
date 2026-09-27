"use client";

/**
 * Suggest Edit as a pane inside the Explore panel, rather than a drawer.
 *
 * The Explore detail panel is itself a drawer. Opening the edit drawer from it
 * put a drawer on top of a drawer: two stacked surfaces, two close buttons, and
 * the entity you were editing hidden behind the thing editing it.
 *
 * Instead this slides in over the panel it was opened from, the way a detail
 * view does on a phone: entity -> fields -> review, each step sliding in from
 * the right, each with a back arrow. Only one surface is ever on screen.
 */

import { Button, Icon } from "@texturehq/edges";
import { EditConfirmStep, EditFieldsStep } from "./EditEntitySteps";
import { useEditEntityFlow } from "./useEditEntityFlow";

export interface InlineEditPaneProps {
  entityType: string;
  entityId: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  /** Dismiss without submitting — the panel slides back to the entity view. */
  onClose: () => void;
  /** The contribution was accepted; the host raises its own status banner. */
  onSubmitted: () => void;
}

export function InlineEditPane({
  entityType,
  entityId,
  entityName,
  currentValues,
  onClose,
  onSubmitted,
}: InlineEditPaneProps) {
  const flow = useEditEntityFlow({ entityType, entityId, entityName, currentValues, onSubmitted });
  const onFields = flow.step === "fields";

  // Back goes one step, not all the way out: from review to the fields you just
  // filled in, and only from the fields back to the entity.
  const handleBack = onFields ? onClose : flow.goBackToFields;

  return (
    <div className="flex h-full flex-col bg-background-surface">
      {/* One back affordance, and it belongs to this pane.
          The Explore shell draws its own back arrow just above the panel, but
          that one pops the route stack — from inside the edit flow it would
          jump straight out to the list and drop the contributor's changes. So
          the shell's arrow is hidden while editing (see .cg-panel-editing in
          explore.css) and this one steps back through the flow instead. */}
      <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onPress={handleBack}
          isDisabled={flow.isSubmitting}
          aria-label={onFields ? `Back to ${entityName}` : "Back to fields"}
        >
          <Icon name="CaretLeft" size="sm" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-text-heading">
            {onFields ? "Suggest Edit" : "Describe your edit"}
          </h2>
          <p className="truncate text-xs text-text-muted">{entityName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {onFields ? (
          <EditFieldsStep
            entityType={entityType}
            fields={flow.fields}
            formValues={flow.formValues}
            isLoadingFields={flow.isLoadingFields}
            fieldsError={flow.fieldsError}
            onFieldChange={flow.handleFieldChange}
            changeSummary={flow.changeSummary}
            hasChanges={flow.hasChanges}
            submitError={flow.submitError}
          />
        ) : (
          <EditConfirmStep
            entityName={entityName}
            changes={flow.changeSummary}
            editSummary={flow.editSummary}
            onEditSummaryChange={flow.setEditSummary}
            sourceType={flow.sourceType}
            sourceUrl={flow.sourceUrl}
            sourceDate={flow.sourceDate}
            onSourceTypeChange={flow.setSourceType}
            onSourceUrlChange={flow.setSourceUrl}
            onSourceDateChange={flow.setSourceDate}
            submitError={flow.submitError}
          />
        )}
      </div>

      {/* The footer is hidden while the fields are still loading or unavailable,
          so there is never a Continue button with nothing to continue from. */}
      {!flow.isLoadingFields && !flow.fieldsError && flow.fields.length > 0 && (
        <div className="space-y-2 border-t border-border-default p-4">
          {onFields && !flow.hasChanges && (
            <p className="text-xs text-text-muted">Change at least one field to continue.</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={handleBack} isDisabled={flow.isSubmitting}>
              {onFields ? "Cancel" : "Back"}
            </Button>
            {onFields ? (
              <Button variant="primary" size="sm" onPress={flow.goToConfirm} isDisabled={!flow.hasChanges}>
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onPress={flow.submit}
                isDisabled={!flow.canSubmit || flow.isSubmitting}
                isLoading={flow.isSubmitting}
              >
                Submit Edit
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
