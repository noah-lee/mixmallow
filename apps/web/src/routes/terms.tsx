import {
  MAX_FILE_BYTES,
  NOTE_LIMIT_PER_TRACK,
  PROJECT_LIMIT,
  STORAGE_LIMIT_BYTES,
} from "@repo/shared/schemas"
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
          pin notes to moments in them. It's free and takes no payments.
          Features may change or be removed over time.
        </p>
      </LegalSection>

      <LegalSection title="Free plan limits">
        <p>Each account can have:</p>
        <ul>
          <li>
            up to {PROJECT_LIMIT} {PROJECT_LIMIT === 1 ? "project" : "projects"}
          </li>
          <li>
            up to {formatBytes(STORAGE_LIMIT_BYTES)} of stored audio in total,
            with each file up to {formatBytes(MAX_FILE_BYTES)}
          </li>
          <li>up to {NOTE_LIMIT_PER_TRACK} notes on each version</li>
        </ul>
        <p>
          Your account page shows how much space you've used. Deleting a version
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
          read it to draw its waveform, and play it back to you. It isn't
          shared, published or used for anything else, and the permission ends
          when you delete the file.
        </p>
        <p>
          Only upload audio you own or have permission to use. You're
          responsible for what you upload.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Don't:</p>
        <ul>
          <li>
            upload anything you don't have the rights to, or anything unlawful
          </li>
          <li>
            use {site.name} to share or distribute files with other people
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
