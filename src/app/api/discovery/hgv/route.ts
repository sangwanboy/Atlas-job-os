import { NextResponse } from "next/server";
import { browserService } from "@/lib/services/browser/service/browser-service";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function POST(request: Request) {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const sessionId = "hgv-london-api-" + Date.now();
    console.log(`[API Discovery] Starting search for HGV Driver jobs in London...`);
    
    try {
        // 1. Navigate
        const url = "https://uk.indeed.com/jobs?q=HGV+Driver&l=London";
        const navResult = await (browserService as any).navigate({ sessionId, url });
        
        if (navResult.status !== "ok") {
            return NextResponse.json({ error: "Navigation failed", details: navResult.error }, { status: 500 });
        }

        // 2. Extract
        const extractInput = {
            sessionId,
            searchTerm: "HGV Driver",
            location: "London",
            pageId: navResult.data?.pageId
        };
        
        const extractResult = await (browserService as any).extractJobs(extractInput);
        
        if (extractResult.status !== "ok") {
            return NextResponse.json({ error: "Extraction failed", details: extractResult.error }, { status: 500 });
        }

        const jobs = extractResult.data?.jobs || [];
        
        // 3. Save to local_jobs.json (Import to pipeline)
        const localJobsPath = path.join(process.cwd(), "project_memory", "local_jobs.json");
        let existingJobs = [];
        try {
            const data = await fs.readFile(localJobsPath, "utf-8");
            existingJobs = JSON.parse(data);
        } catch (e) {}

        const newJobs = jobs.map((j: any) => ({
            id: `hgv-${Math.random().toString(36).substr(2, 9)}`,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.link,
            source: "Indeed",
            status: "discovered",
            discoveredAt: new Date().toISOString()
        }));

        const updatedJobs = [...existingJobs, ...newJobs];
        await fs.writeFile(localJobsPath, JSON.stringify(updatedJobs, null, 2));

        // 4. Cleanup
        await (browserService as any).closeSession({ sessionId });
        
        return NextResponse.json({ 
            success: true, 
            count: newJobs.length,
            jobs: newJobs.slice(0, 15) 
        });
        
    } catch (error: any) {
        console.error(`[API Discovery] Fatal error:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
