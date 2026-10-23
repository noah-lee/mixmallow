import { NOTE_LIMIT_PER_TRACK, PLANS } from "@repo/shared/schemas"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/features/legal/legal-page"
import { formatBytes } from "@/lib/format"
import { site } from "@/lib/site"

// Public: Google's OAuth brand verification reads this page. The plan limits come from the
// shared constants the api enforces; bump site.legalUpdated when the wording changes.
export const Route = createFileRoute("/terms")({
  component: Terms,
})

function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover your use of {site.name}. By signing in, you agree to
        them.
      </p>

      <LegalSection title="The service">
        <p>
          {site.name} lets you upload versions of a track, play them back and
          pin notes to moments in them, on your own or with people you invite.
          It's free and takes no payments. Features may change or be removed
          over time.
        </p>
      </LegalSection>

      <LegalSection title="Free plan limits">
        <p>Each account can own:</p>
        <ul>
          <li>
            up to {PLANS.free.projectLimit}{" "}
            {PLANS.free.projectLimit === 1 ? "project" : "projects"}
          </li>
          <li>
            up to {formatBytes(PLANS.free.storageLimitBytes)} of stored audio in
            total
            {PLANS.free.maxFileBytes < PLANS.free.storageLimitBytes &&
              `, with each file up to ${formatBytes(PLANS.free.maxFileBytes)}`}
          </li>
          <li>
            up to {NOTE_LIMIT_PER_TRACK} notes on each version, counting every
            member's notes
          </li>
          <li>
            up to {PLANS.free.collaboratorLimit} collaborators on each project
          </li>
        </ul>
        <p>
          Projects you join, and versions you upload to them, count toward their
          owner's limits, not yours. Your account page shows how much space your
          projects use, including versions members upload. Deleting a version
          frees its space. These limits may change, and any change will be shown
          here.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You sign in with your Google account and are responsible for activity
          on it. The <Link to="/privacy">privacy policy</Link> explains what's
          stored and how to delete your account.
        </p>
      </LegalSection>

      <LegalSection title="Your music">
        <p>
          You keep all rights to the audio you upload and the notes you write.{" "}
          {site.name} doesn't claim any ownership of them.
        </p>
        <p>
          By uploading a file, you give {site.name} permission only to store it,
          show its waveform, and play it back to you and the members of its
          project. It isn't published or used for anything else, and the
          permission ends when that version, its project or your account is
          deleted.
        </p>
        <p>
          Only upload audio you own or have permission to use. You're
          responsible for what you upload.
        </p>
      </LegalSection>

      <LegalSection title="Sharing projects">
        <p>
          As a project's owner, you decide who gets access. Anyone who has your
          invite link can join until the project is full, so share it only with
          people you trust, and you're responsible for who you invite. You can
          remove a member, or reset or turn off the link so it stops working, at
          any time. Resetting or turning off the link keeps the members who
          already joined, and a removed member can join again with the current
          link until you reset it.
        </p>
        <p>
          Members can listen to every version, upload versions, add notes, mark
          any note done, and edit or delete their own notes. A member can rename
          or delete the versions they uploaded. Only the owner can rename or
          delete the project and other people's versions, and the owner can
          delete anyone's note at any time. Versions a member uploaded count
          toward the owner's storage. Notes and versions a member added stay in
          the project after they leave or are removed.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Don't:</p>
        <ul>
          <li>
            upload anything you don't have the rights to, or anything unlawful
          </li>
          <li>
            use {site.name} to publish or distribute files beyond the people
            you're working with
          </li>
          <li>
            try to access other users' data or break the service's security
          </li>
          <li>
            send automated or excessive requests, or try to get around the plan
            limits
          </li>
        </ul>
        <p>
          Accounts that break these rules may be suspended, and files that break
          them may be removed.
        </p>
      </LegalSection>

      <LegalSection title="Keep your own copies">
        <p>
          {site.name} isn't a backup service. Keep the original of every file
          you upload somewhere else.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          {site.name} is provided "as is", without warranties of any kind. It
          may be unavailable at times, and data loss is possible. To the extent
          the law allows, {site.name}'s operator isn't liable for any damages
          arising from your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms may be updated. The date above shows the latest version,
          and continuing to use {site.name} means you accept it. Significant
          changes will be announced in the app.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions: <ContactLink />
        </p>
      </LegalSection>
    </LegalPage>
  )
}
