// app/api/math-problem/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { supabase } from "../../../lib/supabaseClient";

export const runtime = "nodejs";

const Body = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const Problem = z.object({
  problem_text: z.string().min(10),
  final_answer: z.number(),
});

export async function POST(req: Request) {
  // 0) Read body (or default)
  const { difficulty } = Body.parse(await req.json().catch(() => ({})));

  // 1) Env guard
  const key = process.env.GOOGLE_API_KEY || "";
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY missing" },
      { status: 500 }
    );
  }

  // 2) Model
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  // 3) Difficulty rules for prompt steering
  const rules =
    difficulty === "easy"
      ? "- Single-step + or − within 1–100. Answer is an integer."
      : difficulty === "medium"
      ? "- Two-step using × or ÷ (by 1–2 digits). Numbers ≤ 500. Integer answer."
      : "- 2–3 steps mixing +, −, ×, ÷. Numbers ≤ 1000. No remainders. Integer answer.";

  const prompt = `
Return ONLY JSON: {"problem_text": string, "final_answer": number}
Primary 5 Singapore Math. Difficulty: ${difficulty.toUpperCase()}.
${rules}
Keep to ≤ 2 sentences. final_answer must be numeric only (no units).`;

  // 4) Call Gemini with JSON mime; parse + validate
  let parsed: z.infer<typeof Problem>;
  try {
    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        // Optional: uncomment to enforce structure at model level
        // responseSchema: {
        //   type: "OBJECT",
        //   properties: {
        //     problem_text: { type: "STRING" },
        //     final_answer: { type: "NUMBER" },
        //   },
        //   required: ["problem_text", "final_answer"],
        // },
      },
    });
    const raw = r.response.text().trim();
    parsed = Problem.parse(JSON.parse(raw));
  } catch (e: any) {
    console.error("Gemini/parse error:", e?.message || e);
    return NextResponse.json(
      { error: "Gemini returned invalid JSON. Try again." },
      { status: 502 }
    );
  }

  // 5) Persist to Supabase
  const { data, error } = await supabase
    .from("math_problem_sessions")
    .insert({
      problem_text: parsed.problem_text,
      correct_answer: parsed.final_answer, // repo schema column
      // Optional: persist difficulty if you added the column:
      // difficulty,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Supabase insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 6) Return payload to UI
  return NextResponse.json({
    sessionId: data.id,
    problem_text: parsed.problem_text,
    difficulty, // handy for UI badge
  });
}
