import { NextResponse } from "next/server";
import { resolveRunConfig, runJobs, startSealedRun } from "@/lib/run-jobs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const config = resolveRunConfig();
  if (!config.ok) {
    return NextResponse.json({ error: config.error }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    evalId?: unknown;
    sealedEvalId?: unknown;
  };
  const evalId = body.evalId ?? body.sealedEvalId;
  if (typeof evalId !== "string" || evalId.trim().length === 0) {
    return NextResponse.json({ error: "evalId is required" }, { status: 400 });
  }

  const job = runJobs.create(evalId);
  startSealedRun(job, runJobs, config.config);

  return NextResponse.json({ job }, { status: 202 });
}
