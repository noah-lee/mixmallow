import { createFileRoute } from "@tanstack/react-router"
import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/features/legal/legal-page"
import { site } from "@/lib/site"

// Public: Google's OAuth brand verification reads this page. A starting template that matches
// what the scaffold stores and sends (the users and stripe_* tables, the OAuth scopes, Stripe).
// Keep it in step with the product, and bump site.legalUpdated when it changes.
export const Route = createFileRoute("/privacy")({
  component: Privacy,
})

function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains what data {site.name} collects, how it's used, and
        how you can delete it.
      </p>

      <LegalSection title="Information we collect">
        <p>
          <strong className="font-medium">From your Google account.</strong> You
          sign in with Google. {site.name} requests only the basic{" "}
          <code>openid</code>, <code>email</code> and <code>profile</code>{" "}
          scopes, and stores:
        </p>
        <ul>
          <li>your email address</li>
          <li>your Google account ID</li>
          <li>your name</li>
          <li>the URL of your Google profile picture</li>
        </ul>
        <p>
          {site.name} doesn't access your Gmail, Drive, contacts, calendar or
          any other Google data.
        </p>
        <p>
          <strong className="font-medium">Billing.</strong> Payments are handled
          by Stripe. {site.name} stores your Stripe customer ID and your
          subscription's status and renewal date. Your card details go directly
          to Stripe and never reach {site.name}'s servers.
        </p>
        <p>
          <strong className="font-medium">Technical data.</strong> Sign-in
          cookies that keep you logged in, and standard server logs (IP address,
          request path, time) used for security and debugging. Your theme choice
          is saved in your browser only. {site.name} uses no analytics,
          advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <ul>
          <li>
            Your Google account details identify your account and show your name
            and picture in the app.
          </li>
          <li>Your subscription status decides which features you can use.</li>
        </ul>
        <p>
          Your data isn't sold, used for advertising, or shared with anyone
          except the service providers named here.
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
          anyone, used for advertising, or used to train AI models.
        </p>
      </LegalSection>

      <LegalSection title="Storage and security">
        <p>
          Data is stored in a database on {site.name}'s own server. Connections
          use HTTPS, and sign-in cookies are HTTP-only and secure.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          Your data is kept while your account exists. To delete your account,
          email <ContactLink /> from the address you sign in with. Your account
          and its data will be permanently deleted within 30 days. Server logs
          are kept for a limited time and then removed.
        </p>
        <p>
          You can also revoke {site.name}'s access at any time from your{" "}
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
          If this policy changes, the date above will be updated. Significant
          changes will be announced in the app.
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
