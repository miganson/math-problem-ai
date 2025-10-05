// app/api/math-problem/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { supabase } from "../../../lib/supabaseClient";

export const runtime = "nodejs";

const Body = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  opType: z.enum(["any", "add", "sub", "mul", "div"]).default("any"),
});

const Problem = z.object({
  problem_text: z.string().min(10),
  final_answer: z.coerce.number(),
  hint: z.string().min(5).optional(),
  // allow array OR newline string; coerce to array
  steps: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/\s*\n+\s*/).filter(Boolean) : v),
    z.array(z.string()).min(1).max(10).optional()
  ),
});

const THEMES = [
  "sports day",
  "gardening",
  "library books",
  "bus rides",
  "pets",
  "fruit stall",
  "stationery shop",
  "recycling cans",
  "classroom seats",
  "swimming practice",
  "museum tickets",
  "bicycle rentals",
  "birthday party",
  "zoo animals",
  "farm eggs",
  "sandwiches",
  "oranges",
  "stickers",
  "balloons",
];

const unfence = (s: string) =>
  s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\d+/g, "NUM") // ignore exact numbers
    .replace(/[^a-z\s]/g, " ") // strip punctuation/non-letters (ASCII)
    .replace(/\s+/g, " ") // collapse spaces
    .trim();

function pickTheme(recent: string[]) {
  // avoid using a theme whose keyword already appears in the recent texts
  const bag = normalize(recent.join(" "));
  const shuffled = [...THEMES].sort(() => Math.random() - 0.5);
  return shuffled.find((t) => !bag.includes(normalize(t))) || shuffled[0];
}

export async function POST(req: Request) {
  const { difficulty, opType } = Body.parse(await req.json().catch(() => ({})));

  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY missing" },
      { status: 500 }
    );
  }

  // 1) Fetch a handful of recent problems to steer diversity & de-dupe
  const { data: recentData, error: recentErr } = await supabase
    .from("math_problem_sessions")
    .select("problem_text")
    .order("created_at", { ascending: false })
    .limit(10);

  if (recentErr) {
    return NextResponse.json({ error: recentErr.message }, { status: 500 });
  }
  const recentTexts = (recentData ?? []).map((r) => r.problem_text);
  const recentNorms = new Set(recentTexts.map(normalize));
  const theme = pickTheme(recentTexts);

  // 2) Build op/difficulty rules
  const opText =
    opType === "any"
      ? "Use exactly one of: addition, subtraction, multiplication, or division."
      : opType === "add"
      ? "Operation must be addition."
      : opType === "sub"
      ? "Operation must be subtraction."
      : opType === "mul"
      ? "Operation must be multiplication."
      : "Operation must be division.";

  const rules =
    difficulty === "easy"
      ? "- Single-step, numbers ≤ 100, integer answer."
      : difficulty === "medium"
      ? "- Two steps, numbers ≤ 500, integer answer."
      : "- 2–3 steps mixing operations, numbers ≤ 1000, integer answer.";

  // extract some "banned" words from recent problems (very simple heuristic)
  const banned = Array.from(
    new Set(
      recentTexts
        .join(" ")
        .toLowerCase()
        .match(/\b[a-z]{4,}\b/g) ?? []
    )
  )
    .slice(0, 40) // keep prompt compact
    .join(", ");

  const basePrompt = `
Return ONLY JSON with keys: problem_text (string), final_answer (number), hint (string), steps (string[]).
Primary 5 Singapore Math. Difficulty: ${difficulty.toUpperCase()}.
Theme: ${theme}.
${opText}
${rules}
- Keep the word problem to ≤ 2 sentences.
- Use a scenario consistent with the theme.
- Avoid using these words or an obviously similar scenario: ${
    banned || "(none)"
  }.
- final_answer must be numeric only (no units).
- steps should be a short step-by-step solution a student can follow.
`;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  // 3) Try up to 3 times if we hit a near-duplicate
  const attempts = 3;
  let parsed: z.infer<typeof Problem> | null = null;

  for (let i = 0; i < attempts; i++) {
    // Nudge the model each retry
    const extra =
      i === 0
        ? ""
        : `\nRegenerate with a DIFFERENT scenario than before; do NOT reuse entities or phrasing.\n`;

    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: basePrompt + extra }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.85, // ↑ more variety
        topP: 0.95,
        topK: 40,
        // maxOutputTokens: 256, // optional
      },
    });

    const raw = unfence(r.response.text().trim());
    let candidate: z.infer<typeof Problem>;
    try {
      candidate = Problem.parse(JSON.parse(raw));
    } catch {
      // One more lenient try to parse if fenced or slightly malformed
      try {
        candidate = Problem.parse(JSON.parse(unfence(raw)));
      } catch (e) {
        if (i === attempts - 1) {
          return NextResponse.json(
            { error: "Invalid AI JSON", raw },
            { status: 502 }
          );
        }
        continue; // retry
      }
    }

    // de-dup against recent by normalized text
    const norm = normalize(candidate.problem_text);
    if (!recentNorms.has(norm)) {
      parsed = candidate;
      break;
    }
    // otherwise loop and try again
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "Could not produce a sufficiently diverse problem." },
      { status: 502 }
    );
  }

  // 4) Save
  const { data, error } = await supabase
    .from("math_problem_sessions")
    .insert({
      problem_text: parsed.problem_text,
      correct_answer: parsed.final_answer,
      difficulty,
      op_type: opType === "any" ? null : opType,
      hint: parsed.hint ?? null,
      solution_steps: parsed.steps ?? null, // jsonb
    } as any)
    .select("id, hint, solution_steps")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: data.id,
    problem_text: parsed.problem_text,
    difficulty,
    opType,
    hint: data.hint,
    steps: Array.isArray(data.solution_steps) ? data.solution_steps : [],
  });
}
