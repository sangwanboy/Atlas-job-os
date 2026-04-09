import { prisma } from "@/lib/db";
import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialSlotsUsed = 0;
  try {
    initialSlotsUsed = await prisma.user.count({ where: { role: "USER" } });
  } catch {
    // Graceful fallback — page renders with default counter
  }
  return <LandingPage initialSlotsUsed={initialSlotsUsed} />;
}
