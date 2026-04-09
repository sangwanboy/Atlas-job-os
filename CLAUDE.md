# Atlas Job OS — Claude Instructions

## Skill Auto-Invocation Rules

Always invoke the matching skill **before** responding or writing any code. Use the Skill tool — do not just describe what the skill says.

### Planning & Architecture
| Trigger | Skill |
|---|---|
| New feature, component, functionality, or behavior | `brainstorming` |
| Multi-step task with a spec or requirements | `writing-plans` |
| Executing a written implementation plan | `executing-plans` |
| 2+ independent tasks that can run in parallel | `dispatching-parallel-agents` |
| Independent tasks within the current session | `subagent-driven-development` |

### Development
| Trigger | Skill |
|---|---|
| Any feature or bugfix implementation | `test-driven-development` |
| Any bug, test failure, or unexpected behavior | `systematic-debugging` |
| UI/UX work — components, pages, design, styling | `ui-ux-pro-max` |
| Code uses `anthropic`, `@anthropic-ai/sdk`, or Claude API | `claude-api` |
| Autonomous ML experimentation (train.py, val_bpb) | `autoresearch` |

### Quality & Review
| Trigger | Skill |
|---|---|
| After completing implementation | `verification-before-completion` |
| Before claiming work is done or creating a PR | `verification-before-completion` |
| Submitting work for review | `requesting-code-review` |
| Receiving code review feedback | `receiving-code-review` |
| Implementation complete, deciding how to integrate | `finishing-a-development-branch` |
| Cleanup and quality pass on changed code | `simplify` |

### Git & Workflow
| Trigger | Skill |
|---|---|
| Starting feature work needing isolation | `using-git-worktrees` |
| Configuring automated/recurring behaviors | `update-config` |
| Recurring tasks or polling | `loop` |
| Scheduled remote agent tasks | `schedule` |
| Keyboard shortcut customization | `keybindings-help` |
| Creating or editing a skill | `writing-skills` |
| Questions about Claude Code features/plugins/hooks | `claude-code` |

### File Handling
| Trigger | Skill |
|---|---|
| Any `.docx` / Word document | `anthropic-skills:docx` |
| Any `.pptx` / PowerPoint | `anthropic-skills:pptx` |
| Any `.pdf` file | `anthropic-skills:pdf` |
| Any `.xlsx` / `.csv` spreadsheet | `anthropic-skills:xlsx` |
| Scheduling a remote agent | `anthropic-skills:schedule` |

### Context & Performance
| Trigger | Skill |
|---|---|
| Large output commands, log analysis, API calls, build output | `context-mode:context-mode` |
| Check context savings stats | `context-mode:ctx-stats` |
| Diagnose context-mode issues | `context-mode:ctx-doctor` |
| Update context-mode | `context-mode:ctx-upgrade` |
| Wipe context-mode knowledge base | `context-mode:ctx-purge` |

---

## Project: Atlas Job OS

**What it is:** Cloud-deployed multi-user SaaS — an AI agent ("Atlas") that autonomously searches jobs, scores them against the user's CV, manages the pipeline, and handles outreach via Gmail.

**3 processes to start together:**
```bash
npm run dev          # Next.js :3000
npm run browser-server  # Browser automation :3001/:3002
npm run workers      # BullMQ job/gmail queues
```

**Stack:** Next.js 15, React 19, TypeScript, Tailwind, PostgreSQL + Prisma, Redis + BullMQ, Vertex AI (Gemini), NextAuth v5, Playwright/Patchright, Gmail API.

**Key paths:**
- Agent logic: `src/lib/services/agent/`
- AI provider: `src/lib/services/ai/provider.ts`
- Browser server: `src/lib/services/browser/server.ts`
- Tool registry: `src/lib/services/agent/registry.ts`
- Agent files (per-user): `agents/atlas/users/{userId}/`

**Never describe Atlas as self-hosted** — it is a cloud SaaS platform.
