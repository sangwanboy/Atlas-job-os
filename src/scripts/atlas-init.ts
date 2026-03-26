import { continuitySyncService } from "../lib/services/agent/continuity-sync-service";
import { prisma } from "../lib/db";
import { atlasState, ATLAS_FILES } from "../lib/services/agent/atlas-state-manager";

async function run() {
  console.log("Initializing Atlas architecture in /agents/atlas...");

  // Force re-hydration from a known good DB Agent (Atlas default key is 'job_scout' or 'atlas')
  let agentId = "job_scout";
  try {
    const agent = await prisma.agent.findFirst({
      where: { key: "job_scout" },
      select: { id: true },
    });
    if (agent) {
      agentId = agent.id;
    }
  } catch (err) {
    console.warn("DB unavailable, using fallback mock ID");
  }

  await continuitySyncService.fullHydration(agentId, "force");

  // Create initial empty state files if they missing
  await atlasState.writeJson(ATLAS_FILES.activeTask, {
    task_id: "init-001",
    title: "Initialize Architecture",
    user_request: "Set up the target structure",
    status: "completed",
    source_targets: [],
    search_keywords: [],
    page_progress: 0,
    evidence_count: 0,
    validated_count: 0,
    rejected_count: 0,
    awaiting_user_confirmation: false,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await atlasState.writeText(ATLAS_FILES.soul, await atlasState.readText(ATLAS_FILES.soul, "MISSION: Advance the user's career by finding high-signal jobs.\nVALUES: Precision over volume, Truthfulness, No Fabrication"));
  await atlasState.writeText(ATLAS_FILES.identity, await atlasState.readText(ATLAS_FILES.identity, "NAME: Atlas\nROLE: Senior Strategic Career Intelligence Agent."));
  await atlasState.writeText(ATLAS_FILES.mind, await atlasState.readText(ATLAS_FILES.mind, "MODE: READY\nOBJECTIVE: Awaiting user input\nSTRATEGY: N/A"));
  await atlasState.writeText(ATLAS_FILES.operatingRules, await atlasState.readText(ATLAS_FILES.operatingRules, "- Never fabricate jobs\n- Ask before applying or sending emails"));
  
  await atlasState.writeJson(ATLAS_FILES.preferences, await atlasState.readJson(ATLAS_FILES.preferences, {
    preferred_titles: [],
    preferred_keywords: [],
    excluded_keywords: [],
    target_locations: [],
    remote_preference: "Remote",
    salary_floor: "",
    seniority_targets: [],
    visa_constraints: "",
    outreach_tone: "Professional",
    blacklist_companies: [],
    whitelist_companies: [],
    source_priority: ["LinkedIn", "Indeed"]
  }));

  await atlasState.writeText(ATLAS_FILES.userProfile, await atlasState.readText(ATLAS_FILES.userProfile, "Targeting high-fit engineering roles."));

  await atlasState.writeJson(ATLAS_FILES.tasks, {
    active: [],
    blocked: [],
    awaiting_confirmation: [],
    completed: [],
    failed: []
  });

  await atlasState.writeJson(ATLAS_FILES.browserSessionState, { lastUpdated: new Date().toISOString() });
  await atlasState.writeJson(ATLAS_FILES.gmailState, { lastUpdated: new Date().toISOString() });
  await atlasState.writeJson(ATLAS_FILES.pipelineState, { lastUpdated: new Date().toISOString() });
  await atlasState.writeText(ATLAS_FILES.longTermMemory, "System Initialized.");
  await atlasState.writeText(ATLAS_FILES.outreachMemory, "No outreach performed yet.");
  await atlasState.writeText(ATLAS_FILES.agentSnapshot, "# Atlas Snapshot\nGenerated on " + new Date().toISOString());
  await atlasState.appendNdJson(ATLAS_FILES.runtimeEvents, { type: "system_init", timestamp: new Date().toISOString() });

  console.log("Initialization complete. Directory /agents/atlas populated.");
}

run()
  .catch(console.error)
  .finally(() => process.exit(0));
