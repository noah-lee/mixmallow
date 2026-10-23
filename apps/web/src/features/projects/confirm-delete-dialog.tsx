import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description = "This can't be undone.",
  confirmLabel = "Delete",
  pending,
  onConfirm,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  pending: boolean
  onConfirm: () => void
  // Opened from a menu item, so Radix has no trigger to return focus to.
  returnFocus?: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocus) return
          event.preventDefault()
          returnFocus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pretty">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open until the request settles. */}
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
