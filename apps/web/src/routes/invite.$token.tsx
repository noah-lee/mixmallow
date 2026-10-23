import {
  type InviteResponse,
  inviteTokenSchema,
  type Landing,
} from "@repo/shared/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { CircleAlert, Link2Off, Users } from "lucide-react"
import { type ReactNode, useEffect, useRef } from "react"
import { toast } from "sonner"
import { PageLayout } from "@/components/layout/page-layout"
import { PersonAvatar } from "@/components/layout/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ME_QUERY_KEY, useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import {
  inviteMembershipQueryOptions,
  inviteQueryOptions,
  useJoinInvite,
} from "@/features/invites/api"
import { apiErrorCode, httpStatus } from "@/lib/api"
import { site } from "@/lib/site"

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
})

function InvitePage() {
  return (
    <PageLayout>
      <InviteContent />
    </PageLayout>
  )
}

function InviteContent() {
  const { token } = Route.useParams()
  // A token that can't be one is invalid without asking the server.
  const wellFormed = inviteTokenSchema.safeParse(token).success
  const qc = useQueryClient()
  const me = useMe()
  const signedIn = Boolean(me.data)
  const invite = useQuery({
    ...inviteQueryOptions(token),
    enabled: wellFormed,
  })
  const membership = useQuery({
    ...inviteMembershipQueryOptions(token),
    enabled: wellFormed && signedIn,
  })
  const join = useJoinInvite(token)

  // The session ended and couldn't be refreshed: show the card signed out. A sign-in
  // reloads the page, so no other cached data outlives the old user.
  const sessionLost =
    signedIn &&
    (httpStatus(membership.error) === 401 || httpStatus(join.error) === 401)
  useEffect(() => {
    if (sessionLost) qc.setQueryData(ME_QUERY_KEY, null)
  }, [sessionLost, qc])

  if (
    !wellFormed ||
    httpStatus(invite.error) === 404 ||
    (signedIn && httpStatus(membership.error) === 404) ||
    httpStatus(join.error) === 404
  ) {
    return <InvalidInvite signedIn={signedIn} />
  }

  if (signedIn && membership.data?.membership) {
    return <LandingRedirect landing={membership.data.membership} />
  }

  const failed = [
    me.isError && me,
    invite.isError && invite,
    signedIn && membership.isError && !sessionLost && membership,
  ].filter((q) => q !== false)
  if (failed.length > 0) {
    return (
      <InviteError
        onRetry={() => {
          for (const q of failed) void q.refetch()
        }}
      />
    )
  }

  if (
    me.isPending ||
    !invite.data ||
    (signedIn && membership.isPending) ||
    sessionLost
  ) {
    return <InviteSkeleton />
  }

  const full = apiErrorCode(join.error) === "project_full"
  const joining = join.isPending || join.isSuccess

  return (
    <InviteCard invite={invite.data}>
      {full ? (
        <ProjectFull ownerName={invite.data.owner.name} />
      ) : signedIn ? (
        <JoinButton
          joining={joining}
          onJoin={() =>
            join.mutate(undefined, {
              onError: (err) => {
                const status = httpStatus(err)
                if (
                  status === 401 ||
                  status === 404 ||
                  apiErrorCode(err) === "project_full"
                ) {
                  return
                }
                toast.error("Couldn't join the project. Try again.")
              },
            })
          }
        />
      ) : (
        <SignInButton
          size="lg"
          className="w-full sm:w-auto"
          next={`/invite/${token}`}
        >
          Continue with Google
        </SignInButton>
      )}
      {join.data && <LandingRedirect landing={join.data} />}
    </InviteCard>
  )
}

function LandingRedirect({ landing }: { landing: Landing }) {
  return landing.latestTrack ? (
    <Navigate
      to="/app/projects/$projectId/tracks/$trackId"
      params={{ projectId: landing.projectId, trackId: landing.latestTrack.id }}
      replace
    />
  ) : (
    <Navigate
      to="/app/projects/$projectId"
      params={{ projectId: landing.projectId }}
      replace
    />
  )
}

function InviteCard({
  invite,
  children,
}: {
  invite: InviteResponse
  children: ReactNode
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-tint-lavender p-6 text-center sm:p-8">
      <PersonAvatar
        person={invite.owner}
        className="size-16 ring-4 ring-card *:data-[slot=avatar-fallback]:text-xl"
      />
      <div className="flex w-full flex-col gap-2">
        <p className="text-pretty text-muted-foreground">
          <span className="font-semibold text-foreground">
            {invite.owner.name?.trim() || "Someone"}
          </span>{" "}
          invited you to collaborate on
        </p>
        <h1 className="text-display text-balance [overflow-wrap:anywhere]">
          {invite.projectName}
        </h1>
        <p className="text-pretty text-muted-foreground">
          Listen to every version and leave timestamped notes.
        </p>
      </div>
      <div className="flex w-full flex-col items-center">{children}</div>
    </section>
  )
}

function JoinButton({
  joining,
  onJoin,
}: {
  joining: boolean
  onJoin: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  // Back from signing in, the next step is a single tap (or Enter).
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    // aria-disabled, not disabled: a disabled button would drop keyboard focus mid-join.
    <Button
      ref={ref}
      size="lg"
      className="w-full aria-disabled:pointer-events-none sm:w-auto"
      aria-disabled={joining}
      aria-busy={joining}
      onClick={() => {
        if (!joining) onJoin()
      }}
    >
      {joining && <Spinner data-icon="inline-start" />}
      Join project
    </Button>
  )
}

function ProjectFull({ ownerName }: { ownerName: string | null }) {
  const firstName = ownerName?.trim().split(/\s+/)[0]
  return (
    <Alert role="status" className="text-left">
      <Users />
      <AlertTitle>This project is full</AlertTitle>
      <AlertDescription>
        Ask {firstName || "the project owner"} to make room.
      </AlertDescription>
    </Alert>
  )
}

function InvalidInvite({ signedIn }: { signedIn: boolean }) {
  return (
    <Empty className="p-6 sm:p-12">
      <EmptyMedia variant="icon">
        <Link2Off />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>
          <h1 className="text-heading-2">
            This invite link isn't valid anymore
          </h1>
        </EmptyTitle>
        <EmptyDescription>
          Ask the project owner for a new link.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link to={signedIn ? "/app" : "/"}>Go to {site.name}</Link>
      </Button>
    </Empty>
  )
}

function InviteSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading invite"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-tint-lavender p-6 sm:p-8"
    >
      <Skeleton className="size-16 rounded-full" />
      <div className="flex w-full flex-col items-center gap-3">
        <Skeleton className="h-5 w-3/4 rounded-full" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-5 w-full rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-full sm:w-48" />
    </div>
  )
}

function InviteError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <h1 className="sr-only">Invite</h1>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Couldn't load this invite</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
        </AlertDescription>
      </Alert>
      <Button
        variant="ghost"
        className="w-full sm:w-auto sm:self-start"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  )
}
