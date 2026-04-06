# GCP Setup for Atlas Job OS

## 1. Create GCP Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project → name it `atlas-job-os`
3. Note the **Project ID** (e.g. `atlas-job-os`)

## 2. Enable APIs

In the GCP Console, enable these APIs:

- **Vertex AI API** (`aiplatform.googleapis.com`)
- **Cloud Resource Manager API**

Or via CLI:

```bash
gcloud services enable aiplatform.googleapis.com
```

## 3. Create Service Account

1. IAM & Admin → Service Accounts → **Create Service Account**
2. Name: `atlas-job-os-service-account`
3. Grant role: **Vertex AI User** (`roles/aiplatform.user`)
4. Create & download JSON key → save as `atlas-job-os-service-account.json` in project root

## 4. Configure `.env.local`

```env
VERTEX_AI_PROJECT=atlas-job-os
VERTEX_AI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./atlas-job-os-service-account.json
DEFAULT_AI_MODEL=gemini-3.1-flash-lite-preview
```

## 5. Verify Key File is Gitignored

```bash
grep "service-account" .gitignore
```

If missing, add to `.gitignore`:

```
*service-account*.json
```

## 6. Test the Connection

Start the dev server and send a test message to Atlas. The AI provider reads credentials via `google-auth-library` and hits `us-central1-aiplatform.googleapis.com`.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/services/ai/provider.ts` | Vertex AI auth + token cache + model fallback chain |
| `src/lib/config/env.ts` | Env var definitions (`VERTEX_AI_PROJECT`, `VERTEX_AI_LOCATION`, etc.) |
| `atlas-job-os-service-account.json` | Service account key (gitignored) |

## Model Fallback Chain

```
gemini-3.1-flash-lite-preview → gemini-2.5-flash → gemini-2.5-pro
```

404 on any model falls through to the next (no hard stop).

## Notes

- No `GEMINI_API_KEY` needed — pure Vertex AI service account auth
- Token cache: 55-minute in-memory cache to avoid re-fetching auth tokens
- Backup key location: `C:\Users\Tushar\Downloads\atlas-job-os-6f8ed8f7cbdf.json`
