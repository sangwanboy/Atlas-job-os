import { NextResponse } from "next/server";
import { runtimeSettingsUpdateSchema } from "@/lib/services/settings/runtime-settings-schemas";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId, role } = authResult;
    // Admins read global settings; users read their own (falls back to global)
    const settingsKey = role === "ADMIN" ? "global" : userId;
    const settings = await runtimeSettingsStore.getAsync(settingsKey);
    return NextResponse.json(settings, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load runtime settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId, role } = authResult;
    const body = (await request.json()) as unknown;
    const payload = runtimeSettingsUpdateSchema.parse(body);
    // Admin writes to global (affects all users); regular users write to their own key
    const settingsKey = role === "ADMIN" ? "global" : userId;
    const updated = await runtimeSettingsStore.update(payload, settingsKey);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update runtime settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
