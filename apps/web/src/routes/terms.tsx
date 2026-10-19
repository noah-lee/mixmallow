import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ContactLink,
  LegalPage,
  LegalSection,
} from "@/features/legal/legal-page"
import { site } from "@/lib/site"

// Public: Google's OAuth brand verification reads this page. A starting template; keep it in
// step with the product, and bump site.legalUpdated when it changes.
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
          {site.name} is offered with a free plan and an optional paid
          subscription. Features may change or be removed at any time.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You sign in with your Google account and are responsible for activity
          on it. The data you enter belongs to you. The{" "}
          <Link to="/privacy">privacy policy</Link> explains how it's handled
          and how to delete it.
        </p>
      </LegalSection>

      <LegalSection title="Subscriptions">
        <p>
          Paid subscriptions renew automatically until you cancel. You can
          cancel any time from your account, and you keep access until the end
          of the period you've paid for. Payments are processed by Stripe.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Don't:</p>
        <ul>
          <li>
            try to access other users' data or break the service's security
          </li>
          <li>send automated or excessive requests</li>
          <li>use {site.name} for anything unlawful</li>
        </ul>
        <p>Access may be suspended for accounts that break these rules.</p>
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
          and continuing to use {site.name} means you accept it.
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
