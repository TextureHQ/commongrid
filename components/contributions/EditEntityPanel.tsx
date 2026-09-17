"use client";

import { Button, Drawer, Icon } from "@texturehq/edges";
import { EditFieldsStep } from "./EditEntitySteps";
import { SubmitEditConfirmDialog } from "./SubmitEditConfirmDialog";
import { useEditEntityFlow } from "./useEditEntityFlow";

interface EditEntityPanelProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * Suggest Edit as a drawer, for full entity detail pages.
 *
 * Inside Explore the detail view is itself a drawer, so this would stack one
 * drawer on another; that surface uses PanelEditLayer instead. Both run the
 * same `useEditEntityFlow`, so the steps, validation and payload are identical
 * and only the chrome differs.
 */
export function EditEntityPanel({
  entityType,
  entityId,
  entitySlug: _entitySlug,
  entityName,
  currentValues,
  onClose,
  onSubmitted,
}: EditEntityPanelProps) {
  const flow = useEditEntityFlow({
    entityType,
    entityId,
    entityName,
    currentValues,
    // On a full page the drawer simply closes; the page refresh behind it
    // surfaces the change.
    onSubmitted,
  });

  // The confirm dialog replaces the drawer rather than stacking on top of it,
  // so there is exactly one modal surface on screen at a time.
  if (flow.step === "confirm") {
    return (
      <SubmitEditConfirmDialog
        isOpen
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
        canSubmit={flow.canSubmit}
        isSubmitting={flow.isSubmitting}
        submitError={flow.submitError}
        onBack={flow.goBackToFields}
        onSubmit={flow.submit}
      />
    );
  }

  return (
    <Drawer isOpen onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border-default p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-text-heading">Suggest Edit</h2>
            <p className="truncate text-sm text-text-muted">{entityName}</p>
          </div>
          <Button variant="ghost" size="sm" onPress={onClose} className="ml-2 flex-shrink-0">
            <Icon name="X" size="sm" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
        </div>

        {!flow.isLoadingFields && !flow.fieldsError && flow.fields.length > 0 && (
          <div className="space-y-2 border-t border-border-default p-4">
            {!flow.hasChanges && <p className="text-xs text-text-muted">Change at least one field to continue.</p>}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onPress={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onPress={flow.goToConfirm} isDisabled={!flow.hasChanges}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
