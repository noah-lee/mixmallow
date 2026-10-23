import {
  COLLABORATOR_LIMIT,
  type Member,
  type Person,
  type Project,
} from "@repo/shared/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CircleAlert, Copy, Share2, Users } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { PersonAvatar } from "@/components/layout/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useMe } from "@/features/auth/api"
import {
  inviteLinkQueryOptions,
  membersQueryOptions,
  useCreateInviteLink,
  useLeaveProject,
  useRemoveMember,
  useTurnOffInviteLink,
} from "@/features/members/api"
import { personFirstName, personName } from "@/features/members/person-name"
import { forgetProject, PROJECTS_QUERY_KEY } from "@/features/projects/api"
import { ConfirmDeleteDialog } from "@/features/projects/confirm-delete-dialog"
import { httpStatus } from "@/lib/api"
import { formatShortDate } from "@/lib/format"
import { usePhone } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

type ProjectRef = Pick<Project, "id" | "name" | "role">

// "Share" for the owner, "Members" for a collaborator. `onGone` is the page's not-found
// state: the project was deleted or the caller was removed while the sheet was open.
// `people` (collaborators) replace the icon with stacked avatars.
export function ShareButton({
  project,
  onGone,
  people = [],
}: {
  project: ProjectRef
  onGone: () => void
  people?: Person[]
}) {
  const [open, setOpen] = useState(false)
  const owner = project.role === "owner"
  return (
    <>
      <Button
        variant="outline"
        className="h-11 shrink-0 px-4"
        onClick={() => setOpen(true)}
      >
        {people.length > 0 ? (
          // Decorative: the button's name stays "Share"; the sheet lists who they are.
          <AvatarGroup aria-hidden className="-ml-1.5">
            {people.slice(0, 3).map((person, i) => (
              <PersonAvatar
                key={person.id}
                person={person}
                size="sm"
                className={cn(i === 2 && "hidden sm:flex")}
              />
            ))}
          </AvatarGroup>
        ) : owner ? (
          <Share2 data-icon="inline-start" />
        ) : (
          <Users data-icon="inline-start" />
        )}
        {owner ? "Share" : "Members"}
      </Button>
      <ShareSheet
        open={open}
        onOpenChange={setOpen}
        project={project}
        onGone={onGone}
      />
    </>
  )
}

function ShareSheet({
  open,
  onOpenChange,
  project,
  onGone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectRef
  onGone: () => void
}) {
  const phone = usePhone()
  const owner = project.role === "owner"
  const title = owner ? "Share project" : "Members"
  const description = owner
    ? "Anyone with the link can join, listen and leave notes."
    : `People working on ${project.name}.`
  const gone = () => {
    onOpenChange(false)
    onGone()
  }
  const close = (
    <Button variant="ghost" onClick={() => onOpenChange(false)}>
      Done
    </Button>
  )
  const body = <ShareBody project={project} onGone={gone} />

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">{body}</div>
          <DrawerFooter>{close}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 overflow-y-auto px-6">{body}</div>
        <DialogFooter>{close}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Mounted only while the sheet is open, so both queries refetch on every open.
function ShareBody({
  project,
  onGone,
}: {
  project: ProjectRef
  onGone: () => void
}) {
  const owner = project.role === "owner"
  const me = useMe().data
  const members = useQuery(membersQueryOptions(project.id))
  const link = useQuery({
    ...inviteLinkQueryOptions(project.id),
    enabled: owner,
  })
  const notFound =
    httpStatus(members.error) === 404 || httpStatus(link.error) === 404
  useEffect(() => {
    if (notFound) onGone()
  }, [notFound, onGone])

  if (members.isError && !members.data && !notFound) {
    return (
      <div className="flex flex-col gap-3 pb-2">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Couldn't load the members</AlertTitle>
          <AlertDescription>
            Check your connection and try again.
          </AlertDescription>
        </Alert>
        <Button
          variant="ghost"
          className="w-full sm:w-auto sm:self-start"
          onClick={() => {
            void members.refetch()
            if (owner) void link.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-2">
      {owner && (
        <InviteLinkSection
          projectId={project.id}
          url={link.data?.url}
          failed={link.isError && !link.data && !notFound}
          onRetry={() => void link.refetch()}
          onGone={onGone}
        />
      )}
      {members.data && me ? (
        <MemberList
          project={project}
          members={members.data.items}
          meId={me.id}
        />
      ) : (
        <MembersSkeleton />
      )}
    </div>
  )
}

function InviteLinkSection({
  projectId,
  url,
  failed,
  onRetry,
  onGone,
}: {
  projectId: string
  // undefined while loading.
  url: string | null | undefined
  failed: boolean
  onRetry: () => void
  onGone: () => void
}) {
  const create = useCreateInviteLink(projectId)
  const turnOff = useTurnOffInviteLink(projectId)
  const [confirming, setConfirming] = useState<"reset" | "off" | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const onError = (err: unknown) => {
    if (httpStatus(err) === 404) {
      onGone()
      return
    }
    toast.error("Couldn't update the invite link. Try again.")
  }
  const done = () => setConfirming(null)

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy the link. Select it and copy it instead.")
    }
  }

  let content: ReactNode
  if (failed) {
    content = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Couldn't load the invite link.
        </p>
        <Button
          variant="ghost"
          className="w-full sm:w-auto sm:self-start"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    )
  } else if (url === undefined) {
    content = (
      <div
        role="status"
        aria-label="Loading invite link"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-11 w-2/3 rounded-full" />
      </div>
    )
  } else if (url === null) {
    content = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Create a link and send it to the people you want feedback from.
          They'll sign in with Google to join.
        </p>
        <Button
          className="w-full sm:w-auto sm:self-start"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onError })}
        >
          {create.isPending && <Spinner data-icon="inline-start" />}
          Create invite link
        </Button>
      </div>
    )
  } else {
    content = (
      <div className="flex flex-col gap-3">
        <Input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          className="w-full sm:w-auto sm:self-start"
          onClick={() => void copy(url)}
        >
          <Copy data-icon="inline-start" />
          Copy link
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setConfirming("reset")}
          >
            Reset link
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setConfirming("off")}
          >
            Turn off link
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section aria-labelledby="invite-link" className="flex flex-col gap-3">
      <h3
        ref={headingRef}
        id="invite-link"
        tabIndex={-1}
        className="text-label tracking-wide text-muted-foreground uppercase outline-none"
      >
        Invite link
      </h3>
      {content}
      <ConfirmDeleteDialog
        open={confirming === "reset"}
        onOpenChange={(next) => !next && done()}
        title="Reset the invite link?"
        description="The current link stops working right away. People who already joined keep access."
        confirmLabel="Reset link"
        pending={create.isPending}
        onConfirm={() => create.mutate(undefined, { onSuccess: done, onError })}
        returnFocus={() => headingRef.current?.focus()}
      />
      <ConfirmDeleteDialog
        open={confirming === "off"}
        onOpenChange={(next) => !next && done()}
        title="Turn off the invite link?"
        description="No one new can join until you create a new link. People who already joined keep access."
        confirmLabel="Turn off link"
        pending={turnOff.isPending}
        onConfirm={() =>
          turnOff.mutate(undefined, { onSuccess: done, onError })
        }
        returnFocus={() => headingRef.current?.focus()}
      />
    </section>
  )
}

function MemberList({
  project,
  members,
  meId,
}: {
  project: ProjectRef
  members: Member[]
  meId: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const owner = project.role === "owner"
  const remove = useRemoveMember(project.id)
  const leaveProject = useLeaveProject(project.id)
  // Kept after the confirm closes so its title doesn't blank during the exit animation.
  const [removing, setRemoving] = useState<Member | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const leaveRef = useRef<HTMLButtonElement>(null)

  const collaborators = members.filter((m) => m.role === "collaborator")
  const full = collaborators.length >= COLLABORATOR_LIMIT

  const confirmRemove = (member: Member) =>
    remove.mutate(member.id, {
      onSuccess: () => setConfirmingRemove(false),
      onError: (err) => {
        // They already left, or the project is gone: the refetch tells which (a 404
        // there closes the sheet).
        if (httpStatus(err) === 404) {
          setConfirmingRemove(false)
          void qc.invalidateQueries({
            queryKey: membersQueryOptions(project.id).queryKey,
          })
          return
        }
        toast.error(`Couldn't remove ${personName(member, meId)}. Try again.`)
      },
    })

  const leave = async () => {
    await navigate({ to: "/app/projects" })
    forgetProject(qc, project.id)
    void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true })
  }
  const confirmLeave = async () => {
    try {
      await leaveProject.mutateAsync(meId)
    } catch (err) {
      if (httpStatus(err) !== 404) {
        toast.error("Couldn't leave the project. Try again.")
        return
      }
    }
    await leave()
  }

  return (
    <section aria-labelledby="members" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3
          ref={headingRef}
          id="members"
          tabIndex={-1}
          className="text-label tracking-wide text-muted-foreground uppercase outline-none"
        >
          Members
        </h3>
        {owner && (
          <p
            className={cn(
              "text-caption",
              full ? "font-semibold text-warning" : "text-muted-foreground",
            )}
          >
            {collaborators.length} of {COLLABORATOR_LIMIT} collaborators
          </p>
        )}
      </div>
      {owner && full && (
        <p className="rounded-lg bg-warning-tint px-3 py-2 text-sm font-medium text-warning">
          New people can't join until you remove someone.
        </p>
      )}
      <ul className="flex flex-col">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            meId={meId}
            action={
              owner && member.role === "collaborator" ? (
                <Button
                  variant="ghost"
                  className="-mr-3 h-11 shrink-0 px-4 sm:-mr-4"
                  aria-label={`Remove ${personName(member, meId)}`}
                  onClick={() => {
                    setRemoving(member)
                    setConfirmingRemove(true)
                  }}
                >
                  Remove
                </Button>
              ) : null
            }
          />
        ))}
      </ul>
      {owner && collaborators.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No one has joined yet. Share the link to invite someone.
        </p>
      )}
      {!owner && (
        <Button
          ref={leaveRef}
          variant="outline"
          className="w-full text-destructive sm:w-auto sm:self-start"
          onClick={() => setLeaving(true)}
        >
          Leave project
        </Button>
      )}

      <ConfirmDeleteDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={
          removing
            ? `Remove ${personFirstName(removing)} from ${project.name}?`
            : ""
        }
        description="Their notes and versions stay. They can rejoin with the current link, so reset it to stop that."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && confirmRemove(removing)}
        returnFocus={() => headingRef.current?.focus()}
      />
      <ConfirmDeleteDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${project.name}?`}
        description="Your notes and versions stay in the project."
        confirmLabel="Leave project"
        pending={leaveProject.isPending}
        onConfirm={() => void confirmLeave()}
        returnFocus={() => leaveRef.current?.focus()}
      />
    </section>
  )
}

function MemberRow({
  member,
  meId,
  action,
}: {
  member: Member
  meId: string
  action: ReactNode
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 border-b py-2 last:border-b-0">
      <PersonAvatar person={member} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words">
          {personName(member, meId)}
        </span>
        {member.joinedAt && (
          <span className="text-sm text-muted-foreground">
            Joined {formatShortDate(member.joinedAt)}
          </span>
        )}
      </div>
      {member.role === "owner" && <Badge variant="tint">Owner</Badge>}
      {action}
    </li>
  )
}

function MembersSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading members"
      className="flex flex-col gap-3"
    >
      <Skeleton className="h-4 w-24 rounded-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1 rounded-full" />
        </div>
      ))}
    </div>
  )
}
