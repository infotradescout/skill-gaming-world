import { PublicShell } from "@/components/site-shell";
import "@/components/marketing.css";
import "@/components/game-launcher.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
