import { prisma } from "@/lib/db";

/**
 * Heuristics matching logic connecting a raw email thread back to a Job in the PostgreSQL CRM.
 */
export async function matchThreadToJob(
  userId: string, 
  threadSubject: string, 
  threadSnippet: string, 
  fromHeader: string,
  skipPrisma: boolean = false
): Promise<{ jobId: string | null; confidence: number; reason: string }> {
  
  // Attempt to extract the domain from the sender email
  const domainMatch = fromHeader.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const domain = domainMatch ? domainMatch[1].toLowerCase() : "";

  // Skip matching common generic freemail domains
  const ignoreDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];
  const isValidCorporateDomain = domain && !ignoreDomains.includes(domain);

  let jobs: any[] = [];
  if (!skipPrisma) {
    try {
      jobs = await (prisma as any).job.findMany({
        where: { userId },
        select: { id: true, title: true, company: { select: { name: true, website: true } } }
      });
    } catch (error) {
      console.warn("[matchThreadToJob] Prisma unreachable, skipping job matching logic.");
    }
  }

  let bestMatchId: string | null = null;
  let highestConfidence = 0;
  let bestReason = "Unrelated";

  for (const job of jobs) {
    let confidence = 0;
    const reasons: string[] = [];

    // 1. Company Name Match
    if (job.company?.name && (
        threadSubject.toLowerCase().includes(job.company.name.toLowerCase()) || 
        threadSnippet.toLowerCase().includes(job.company.name.toLowerCase()) || 
        fromHeader.toLowerCase().includes(job.company.name.toLowerCase())
      )) {
      confidence += 0.5;
      reasons.push(`Company name '${job.company.name}' found`);
    }

    // 2. Domain Match
    if (isValidCorporateDomain && job.company?.website && job.company.website.toLowerCase().includes(domain)) {
      confidence += 0.4;
      reasons.push(`Domain '${domain}' matches company website`);
    }

    // 3. Title Match
    if (job.title && threadSubject.toLowerCase().includes(job.title.toLowerCase())) {
      confidence += 0.3;
      reasons.push(`Role title '${job.title}' mentioned in subject`);
    }

    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      bestMatchId = job.id;
      bestReason = reasons.join(", ");
    }
  }

  // Threshold for auto-attach assumption
  if (highestConfidence >= 0.5) {
    return { 
      jobId: bestMatchId, 
      confidence: Math.min(highestConfidence, 1), 
      reason: bestReason 
    };
  }

  return { 
    jobId: null, 
    confidence: highestConfidence, 
    reason: highestConfidence > 0 ? `Weak match: ${bestReason}` : "No match signals detected" 
  };
}
