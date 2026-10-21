import { createFileRoute } from "@tanstack/react-router"
import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/features/legal/legal-page"
import { site } from "@/lib/site"

// Public: Google's OAuth brand verification reads this page. Keep it in step with what the
// schema and storage driver keep, and bump site.legalUpdated when it changes.
export const Route = createFileRoute("/privacy")({
  component: Privacy,
})

function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains what {site.name} stores, why, where it's kept, and
        how you can delete it.
      </p>

      <LegalSection title="What we collect">
        <p>
          <strong className="font-semibold">From your Google account.</strong>{" "}
          You sign in with Google. {site.name} asks only for the basic openid,
          email and profile scopes, and stores:
        </p>
        <ul>
          <li>your email address</li>
          <li>your Google account ID</li>
          <li>your name</li>
          <li>the web address of your Google profile picture</li>
        </ul>
        <p>
          {site.name} doesn't access your Gmail, Drive, contacts, calendar or
          any other Google data.
        </p>
        <p>
          <strong className="font-semibold">Your audio files.</strong> The files
          you upload, with their file name, format, size and length, and a small
          waveform summary your browser makes from the file when you upload it.
        </p>
        <p>
          <strong className="font-semibold">What you write.</strong> Project and
          version names, and your notes with their timestamps and whether
          they're marked done.
        </p>
        <p>
          <strong className="font-semibold">Technical data.</strong> Sign-in
          cookies that keep you signed in, and standard server logs (IP address,
          request path, time) used for security and fixing problems. Your theme
          choice is saved in your browser only. {site.name} uses no analytics,
          advertising or tracking cookies.
        </p>
        <p>
          <strong className="font-semibold">No payments.</strong> {site.name} is
          free and takes no payments, so it holds no card or billing details.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <ul>
          <li>
            Your Google account details identify your account and show your name
            and picture in the app.
          </li>
          <li>
            Your files, names and notes are stored only so you can play, review
            and organise them. They're private to your account: no other{" "}
            {site.name} user can see them.
          </li>
          <li>
            File sizes count toward your free storage limit, shown on your
            account page.
          </li>
        </ul>
        <p>
          Your data isn't sold, used for advertising, or shared with anyone
          except the service providers named on this page.
        </p>
      </LegalSection>

      <LegalSection title="Google user data">
        <p>
          {site.name}'s use and transfer of information received from Google
          APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google account data is used
          only to sign you in and identify your account. It isn't transferred to
          anyone or used for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Where it's stored">
        <p>
          Your account details, names and notes are stored in a database on{" "}
          {site.name}'s own server. Audio files are stored in DigitalOcean
          Spaces, a cloud file storage service. The storage isn't public: your
          browser uploads and plays each file through a private link that
          expires after a short time.
        </p>
        <p>
          Connections use HTTPS, and sign-in cookies are HTTP-only and secure.
        </p>
      </LegalSection>

      <LegalSection title="Keeping and deleting your data">
        <p>
          Your data is kept while your account exists. When you delete a
          version, its audio file and notes are deleted. When you delete a
          project, all its versions, files and notes are deleted.
        </p>
        <p>
          To delete your whole account, email <ContactLink /> from the address
          you sign in with. Your account, files and notes will be permanently
          deleted within 30 days. Server logs are kept for a limited time and
          then removed.
        </p>
        <p>
          You can also remove {site.name}'s access at any time from your{" "}
          <a href="https://myaccount.google.com/connections">
            Google account settings
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>{site.name} isn't intended for anyone under 13.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes, the date above will be updated and the new
          version applies from then. If you don't agree with a change, you can
          ask for your account to be deleted.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions or requests: <ContactLink />
        </p>
      </LegalSection>
    </LegalPage>
  )
}
