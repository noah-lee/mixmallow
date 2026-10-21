import { Copy, LogOut, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Demo, ShowcaseSection } from "@/features/showcase/showcase-section"

export function AlertDialogSection() {
  return (
    <ShowcaseSection title="Alert dialog">
      <Demo label="Sizes">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Delete track</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete “Midnight drive”?</AlertDialogTitle>
              <AlertDialogDescription>
                All versions and notes go with it. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Small alert</Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Discard note?</AlertDialogTitle>
              <AlertDialogDescription>
                Your draft will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Demo>
    </ShowcaseSection>
  )
}

export function DialogSection() {
  return (
    <ShowcaseSection title="Dialog">
      <Demo label="Form">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>
                Everyone you've shared with sees the new name.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dialog-name">Name</FieldLabel>
                <Input id="dialog-name" defaultValue="Summer EP" />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Save</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Demo>
    </ShowcaseSection>
  )
}

export function DrawerSection() {
  return (
    <ShowcaseSection title="Drawer">
      <Demo label="Bottom">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">Open drawer</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Note at 01:24</DrawerTitle>
              <DrawerDescription>Vocal too quiet here.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button size="lg">Mark done</Button>
              <DrawerClose asChild>
                <Button size="lg" variant="outline">
                  Close
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </Demo>
    </ShowcaseSection>
  )
}

export function DropdownMenuSection() {
  const [showDone, setShowDone] = useState(true)
  const [sort, setSort] = useState("time")

  return (
    <ShowcaseSection title="Dropdown menu">
      <Demo label="Full menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="icon" size="icon" aria-label="Track actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>Track</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Pencil />
                Rename
                <DropdownMenuShortcut>R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Download (disabled)</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showDone}
              onCheckedChange={setShowDone}
            >
              Show done notes
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sort notes</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                  <DropdownMenuRadioItem value="time">
                    By time
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="newest">
                    Newest
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LogOut />
              Leave project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Demo>
    </ShowcaseSection>
  )
}

export function PopoverSection() {
  return (
    <ShowcaseSection title="Popover">
      <Demo label="With form">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Jump to time</Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader>
              <PopoverTitle>Jump to time</PopoverTitle>
              <PopoverDescription>Minutes and seconds.</PopoverDescription>
            </PopoverHeader>
            <Field>
              <FieldLabel htmlFor="popover-time">Time</FieldLabel>
              <Input id="popover-time" defaultValue="01:24" />
            </Field>
          </PopoverContent>
        </Popover>
      </Demo>
    </ShowcaseSection>
  )
}

const sheetSides = ["right", "left", "top", "bottom"] as const

export function SheetSection() {
  return (
    <ShowcaseSection title="Sheet">
      <Demo label="Sides">
        {sheetSides.map((side) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="outline">Open {side}</Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>Project settings</SheetTitle>
                <SheetDescription>Opens from the {side}.</SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <SheetClose asChild>
                  <Button size="lg">Done</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </Demo>
    </ShowcaseSection>
  )
}

export function ToastSection() {
  return (
    <ShowcaseSection title="Toast">
      <Demo label="Kinds">
        <Button variant="outline" onClick={() => toast("Link copied")}>
          Default
        </Button>
        <Button variant="outline" onClick={() => toast.success("Mix uploaded")}>
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.info("v4 is processing")}
        >
          Info
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.warning("Storage is 90% full")}
        >
          Warning
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.error("Upload failed. Try again.")}
        >
          Error
        </Button>
        <Button variant="outline" onClick={() => toast.loading("Uploading…")}>
          Loading
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast("Note deleted", {
              action: { label: "Undo", onClick: () => toast("Note restored") },
            })
          }
        >
          With action
        </Button>
      </Demo>
    </ShowcaseSection>
  )
}

export function TooltipSection() {
  return (
    <ShowcaseSection title="Tooltip">
      <Demo label="Triggers">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>Add a note at the playhead</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="icon" size="icon" aria-label="Copy link">
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Copy link <Kbd>C</Kbd>
          </TooltipContent>
        </Tooltip>
      </Demo>
    </ShowcaseSection>
  )
}
