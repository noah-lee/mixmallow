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
  pending,
  onConfirm,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
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
          <AlertDialogTitle className="text-balance">{title}</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open until the request settles. */}
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Spinner data-icon="inline-start" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
