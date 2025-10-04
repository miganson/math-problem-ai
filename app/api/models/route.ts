import { NextResponse } from "next/server";

export async function GET() {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
      process.env.GOOGLE_API_KEY
  );
  const j = await r.json();
  const models = (j.models || []).filter((m: any) =>
    (m.supportedGenerationMethods || []).includes("generateContent")
  );
  return NextResponse.json(models.map((m: any) => m.name));
}
