import { prisma } from "../src/lib/db";

async function main() {
  const jobs = await prisma.job.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      title: true,
      company: true,
      descriptionClean: true,
      requiredSkills: true,
      salaryMin: true,
      salaryMax: true,
      sourceRef: true,
    },
  });

  let good = 0, bad = 0;
  for (const j of jobs) {
    const descLen = j.descriptionClean?.length || 0;
    const hasRealDesc = descLen > 100 && !j.descriptionClean?.startsWith(j.title || "");
    const skills = j.requiredSkills?.length || 0;
    const url = (j.sourceRef as any)?.url || "";
    const src = url.includes("linkedin") ? "LinkedIn"
      : url.includes("reed") ? "Reed"
      : url.includes("indeed") ? "Indeed"
      : url.includes("totaljobs") ? "TotalJobs"
      : url.includes("cv-library") ? "CV-Library"
      : url.includes("caterer") ? "Caterer"
      : "Other";

    const hasSalary = !!(j.salaryMin || j.salaryMax);
    if (hasRealDesc) good++; else bad++;
    console.log(`${hasRealDesc ? "GOOD" : "BAD "} | ${src.padEnd(10)} | desc=${String(descLen).padStart(5)} | skills=${skills} | sal=${hasSalary ? "Y" : "N"} | ${j.title?.slice(0, 40)}`);
  }
  console.log(`\nSummary: ${good} good, ${bad} bad out of ${jobs.length} jobs`);
  await prisma.$disconnect();
}

main();
