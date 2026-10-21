import {
  AlertCircle,
  ChevronsUpDown,
  CircleCheck,
  Inbox,
  Music,
  Upload,
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Demo, ShowcaseSection } from "@/features/showcase/showcase-section"

export function AccordionSection() {
  return (
    <ShowcaseSection title="Accordion">
      <Accordion type="single" collapsible defaultValue="formats">
        <AccordionItem value="formats">
          <AccordionTrigger>Which formats can I upload?</AccordionTrigger>
          <AccordionContent>WAV, AIFF, FLAC and MP3.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="share">
          <AccordionTrigger>Who can hear my mixes?</AccordionTrigger>
          <AccordionContent>Only people you send the link to.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="disabled" disabled>
          <AccordionTrigger>Disabled item</AccordionTrigger>
          <AccordionContent>Hidden.</AccordionContent>
        </AccordionItem>
      </Accordion>
    </ShowcaseSection>
  )
}

export function AlertSection() {
  return (
    <ShowcaseSection title="Alert">
      <Demo label="Variants" className="flex-col items-stretch">
        <Alert>
          <CircleCheck />
          <AlertTitle>Mix uploaded</AlertTitle>
          <AlertDescription>v3 is ready to share.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>The file is over 500 MB.</AlertDescription>
        </Alert>
        <Alert>
          <AlertTitle>Title only, with an action</AlertTitle>
          <AlertAction>
            <Button size="xs" variant="outline">
              Undo
            </Button>
          </AlertAction>
        </Alert>
      </Demo>
    </ShowcaseSection>
  )
}

export function AvatarSection() {
  return (
    <ShowcaseSection title="Avatar">
      <Demo label="Sizes">
        {(["sm", "default", "lg"] as const).map((size) => (
          <Avatar key={size} size={size}>
            <AvatarFallback>NL</AvatarFallback>
          </Avatar>
        ))}
      </Demo>
      <Demo label="With badge">
        {(["sm", "default", "lg"] as const).map((size) => (
          <Avatar key={size} size={size}>
            <AvatarFallback>M</AvatarFallback>
            <AvatarBadge className="bg-success" />
          </Avatar>
        ))}
      </Demo>
      <Demo label="Group">
        <AvatarGroup>
          {["A", "M", "S"].map((initials) => (
            <Avatar key={initials}>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+4</AvatarGroupCount>
        </AvatarGroup>
      </Demo>
    </ShowcaseSection>
  )
}

export function CardSection() {
  return (
    <ShowcaseSection title="Card">
      {(["default", "sm"] as const).map((size) => (
        <Demo key={size} label={size} className="block">
          <Card size={size}>
            <CardHeader>
              <CardTitle>Summer EP</CardTitle>
              <CardDescription>4 tracks · updated 2 days ago</CardDescription>
              <CardAction>
                <Badge variant="tint">3 notes</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p>Second pass on the vocal levels is in.</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Open</Button>
              <Button size="sm" variant="ghost">
                Share
              </Button>
            </CardFooter>
          </Card>
        </Demo>
      ))}
    </ShowcaseSection>
  )
}

export function CollapsibleSection() {
  return (
    <ShowcaseSection title="Collapsible">
      <Collapsible className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium">Older versions</span>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Toggle older versions"
            >
              <ChevronsUpDown />
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-2 text-sm">v3 — final</div>
        <CollapsibleContent className="flex flex-col gap-2">
          <div className="rounded-md border px-4 py-2 text-sm">v2 — louder</div>
          <div className="rounded-md border px-4 py-2 text-sm">v1 — rough</div>
        </CollapsibleContent>
      </Collapsible>
    </ShowcaseSection>
  )
}

export function EmptySection() {
  return (
    <ShowcaseSection title="Empty">
      <Demo label="Icon media" className="block">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Music />
            </EmptyMedia>
            <EmptyTitle>No tracks yet</EmptyTitle>
            <EmptyDescription>
              Upload a mix to start collecting notes.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>
              <Upload data-icon="inline-start" />
              Upload a mix
            </Button>
          </EmptyContent>
        </Empty>
      </Demo>
      <Demo label="Default media" className="block">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia>
              <Inbox className="size-8 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No notes</EmptyTitle>
            <EmptyDescription>
              Notes on this version appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Demo>
    </ShowcaseSection>
  )
}

export function ItemSection() {
  return (
    <ShowcaseSection title="Item">
      {(["default", "outline", "muted"] as const).map((variant) => (
        <Demo key={variant} label={variant} className="block">
          <ItemGroup>
            {(["default", "sm", "xs"] as const).map((size) => (
              <Item key={size} variant={variant} size={size}>
                <ItemMedia variant="icon">
                  <Music />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Midnight drive ({size})</ItemTitle>
                  <ItemDescription>
                    <span className="font-mono">3:47</span> · v3 · 2 open notes
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </Demo>
      ))}
    </ShowcaseSection>
  )
}

export function ProgressSection() {
  return (
    <ShowcaseSection title="Progress">
      <Demo label="Values" className="flex-col items-stretch">
        {[0, 40, 100].map((value) => (
          <Progress
            key={value}
            value={value}
            aria-label={`${value}% uploaded`}
          />
        ))}
      </Demo>
    </ShowcaseSection>
  )
}

export function ScrollAreaSection() {
  return (
    <ShowcaseSection title="Scroll area">
      <ScrollArea className="h-48 rounded-md border">
        <ul className="flex flex-col p-4 text-sm">
          {Array.from({ length: 20 }, (_, i) => (
            <li key={i} className="border-b py-2 last:border-0">
              Note {i + 1} at{" "}
              <span className="font-mono">
                0{Math.floor((i * 17) / 60)}:
                {String((i * 17) % 60).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </ShowcaseSection>
  )
}

export function SeparatorSection() {
  return (
    <ShowcaseSection title="Separator">
      <Demo label="Horizontal" className="flex-col items-stretch">
        <span>Above</span>
        <Separator />
        <span>Below</span>
      </Demo>
      <Demo label="Vertical" className="h-6">
        <span>v1</span>
        <Separator orientation="vertical" />
        <span>v2</span>
        <Separator orientation="vertical" />
        <span>v3</span>
      </Demo>
    </ShowcaseSection>
  )
}

export function SkeletonSection() {
  return (
    <ShowcaseSection title="Skeleton">
      <Demo label="Track row" className="flex-nowrap">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </Demo>
      <Demo label="Waveform" className="block">
        <Skeleton className="h-16 w-full rounded-lg" />
      </Demo>
    </ShowcaseSection>
  )
}

export function SpinnerSection() {
  return (
    <ShowcaseSection title="Spinner">
      <Demo label="Sizes">
        <Spinner />
        <Spinner className="size-6" />
        <Spinner className="size-8 text-primary-text" />
      </Demo>
    </ShowcaseSection>
  )
}

const notes = [
  {
    time: "00:42",
    author: "Mia",
    text: "Kick is masking the bass",
    done: true,
  },
  { time: "01:24", author: "Sam", text: "Vocal too quiet here", done: false },
  { time: "02:58", author: "Mia", text: "Love the reverb tail", done: false },
]

export function TableSection() {
  return (
    <ShowcaseSection title="Table">
      <Table>
        <TableCaption>Notes on v3</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map((note) => (
            <TableRow key={note.time}>
              <TableCell className="font-mono">{note.time}</TableCell>
              <TableCell>{note.author}</TableCell>
              <TableCell>{note.text}</TableCell>
              <TableCell className="text-right">
                <Badge variant={note.done ? "success" : "secondary"}>
                  {note.done ? "Done" : "Open"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Open</TableCell>
            <TableCell className="text-right">2</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </ShowcaseSection>
  )
}

export function TabsSection() {
  return (
    <ShowcaseSection title="Tabs">
      {(["default", "line"] as const).map((variant) => (
        <Demo key={variant} label={variant} className="block">
          <Tabs defaultValue="notes">
            <TabsList variant={variant}>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="notes" className="pt-3 text-sm">
              Two open notes on this version.
            </TabsContent>
            <TabsContent value="versions" className="pt-3 text-sm">
              Three versions uploaded.
            </TabsContent>
          </Tabs>
        </Demo>
      ))}
      <Demo label="Vertical" className="block">
        <Tabs defaultValue="a" orientation="vertical" className="flex-row">
          <TabsList>
            <TabsTrigger value="a">Intro</TabsTrigger>
            <TabsTrigger value="b">Verse</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-sm">
            <span className="font-mono">0:00 – 0:32</span>
          </TabsContent>
          <TabsContent value="b" className="text-sm">
            <span className="font-mono">0:32 – 1:10</span>
          </TabsContent>
        </Tabs>
      </Demo>
    </ShowcaseSection>
  )
}
