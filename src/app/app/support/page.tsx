import { AppPageHeader } from "@/components/app-shell";
import { SupportAppealForm } from "@/components/support-appeal-form";

export default function SupportPage() {
  return (
    <>
      <AppPageHeader eyebrow="Account support" title="Request a review">
        <p>
          Submit an account, game-result, restriction, or sandbox Play Coin
          concern. A request records an auditable appeal; it does not silently
          edit the original record.
        </p>
      </AppPageHeader>
      <SupportAppealForm />
    </>
  );
}
