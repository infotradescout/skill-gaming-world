import { PublicShell } from "@/components/site-shell";
import "@/components/marketing.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
