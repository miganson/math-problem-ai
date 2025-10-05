import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getSupabase } from "../../../lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Topic =
  | "any"
  | "fractions-division" 
  | "percentage" 
  | "ratio" 
  | "rate" 
  | "area-triangle" 
  | "volume-cube-cuboid"
  | "angles" 
  | "triangles" 
  | "quadrilaterals";

const Body = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  opType: z.enum(["any", "add", "sub", "mul", "div"]).default("any"),
  topic: z
    .enum([
      "any",
      "fractions-division",
      "percentage",
      "ratio",
      "rate",
      "area-triangle",
      "volume-cube-cuboid",
      "angles",
      "triangles",
      "quadrilaterals",
    ])
    .default("any"),
});

const Problem = z.object({
  problem_text: z.string().min(10),
  final_answer: z.coerce.number(),
  hint: z.string().min(5).optional(),
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
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "NUM")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function pickTheme(recent: string[]) {
  const bag = normalize(recent.join(" "));
  const shuffled = [...THEMES].sort(() => Math.random() - 0.5);
  return shuffled.find((t) => !bag.includes(normalize(t))) || shuffled[0];
}

const TOPIC_RULES: Record<Exclude<Topic, "any">, string> = {
  "fractions-division":
    "- P5 Fractions (division): divide a proper fraction by whole number, or whole/proper by proper; no calculator.",
  percentage:
    "- P5 Percentage: find the whole from a part & %; compute % increase/decrease; realistic contexts.",
  ratio:
    "- P5 Ratio: a:b or a:b:c with whole-number terms; equivalent ratios; divide a quantity in a given ratio; simplest form; relate ratio↔fraction.",
  rate: "- P5 Rate: amount per 1 unit; find rate, total, or units given two of them.",
  "area-triangle":
    "- P5 Area: base/height concepts; area of triangle; composites of rectangles/squares/triangles.",
  "volume-cube-cuboid":
    "- P5 Volume: cm³/ℓ relationships; volume of cube/cuboid; liquid in rectangular tank; exclude cm³↔m³ conversion.",
  angles:
    "- P5 Angles: straight line, at a point, vertically opposite; find unknown angles (no extra constructions).",
  triangles:
    "- P5 Triangles: properties (isosceles/equilateral/right); angle-sum 180°; find unknown angles (no extra constructions).",
  quadrilaterals:
    "- P5 Parallelogram/Rhombus/Trapezium: properties; find unknown angles (no extra constructions).",
};

const TOPIC_LABEL: Record<Topic, string> = {
  any: "Any P5 topic",
  "fractions-division": "Fractions (division)",
  percentage: "Percentage",
  ratio: "Ratio",
  rate: "Rate",
  "area-triangle": "Area of triangle",
  "volume-cube-cuboid": "Volume of cube/cuboid",
  angles: "Angles",
  triangles: "Triangles",
  quadrilaterals: "Parallelogram, Rhombus, Trapezium",
};

export async function POST(req: Request) {
  const supabase = getSupabase();
  const { difficulty, opType, topic } = Body.parse(
    await req.json().catch(() => ({}))
  );
  const key = process.env.GOOGLE_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "GOOGLE_API_KEY missing" },
      { status: 500 }
    );

  const { data: recentData, error: recentErr } = await supabase
    .from("math_problem_sessions")
    .select("problem_text")
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentErr)
    return NextResponse.json({ error: recentErr.message }, { status: 500 });

  const recentTexts = (recentData ?? []).map((r) => r.problem_text);
  const recentNorms = new Set(recentTexts.map(normalize));
  const theme = pickTheme(recentTexts);

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
  const diffText =
    difficulty === "easy"
      ? "- Single-step, numbers ≤ 100, integer answer."
      : difficulty === "medium"
      ? "- Two steps, numbers ≤ 500, integer answer."
      : "- 2–3 steps mixing operations, numbers ≤ 1000, integer answer.";

  const topicText =
    topic === "any"
      ? [
          TOPIC_RULES["fractions-division"],
          TOPIC_RULES.percentage,
          TOPIC_RULES.ratio,
          TOPIC_RULES.rate,
          TOPIC_RULES["area-triangle"],
          TOPIC_RULES["volume-cube-cuboid"],
          TOPIC_RULES.angles,
          TOPIC_RULES.triangles,
          TOPIC_RULES.quadrilaterals,
        ].join("\n")
      : TOPIC_RULES[topic];

  const banned = Array.from(
    new Set(
      recentTexts
        .join(" ")
        .toLowerCase()
        .match(/\b[a-z]{4,}\b/g) ?? []
    )
  )
    .slice(0, 40)
    .join(", ");

  const basePrompt = `
Return ONLY JSON with keys: problem_text (string), final_answer (number), hint (string), steps (string[]).

Primary 5 Singapore Math. Topic focus: ${TOPIC_LABEL[topic]}.
Stay strictly within Primary 5 scope for the selected topic:
${topicText}

Theme for the story: ${theme}.
${opText}
${diffText}
- Keep the word problem to ≤ 2 sentences, realistic everyday contexts.
- No calculator methods; integer final_answer only (no units).
- Encourage model drawing or diagram thinking in hint/steps where relevant (bar model, base-height, angle facts).
- Avoid using these words or an obviously similar scenario: ${
    banned || "(none)"
  }.
`;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const attempts = 3;
  let parsed: z.infer<typeof Problem> | null = null;
  for (let i = 0; i < attempts; i++) {
    const extra =
      i === 0
        ? ""
        : "\nRegenerate with a DIFFERENT scenario and wording than before.\n";
    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: basePrompt + extra }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.85,
        topP: 0.95,
        topK: 40,
      },
    });

    const raw = unfence(r.response.text().trim());
    try {
      const candidate = Problem.parse(JSON.parse(raw));
      const norm = normalize(candidate.problem_text);
      if (!recentNorms.has(norm)) {
        parsed = candidate;
        break;
      }
    } catch {
    }
  }
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not produce a sufficiently diverse problem." },
      { status: 502 }
    );
  }

  const { data, error } = await supabase
    .from("math_problem_sessions")
    .insert({
      problem_text: parsed.problem_text,
      correct_answer: parsed.final_answer,
      difficulty,
      op_type: opType === "any" ? null : opType,
      hint: parsed.hint ?? null,
      solution_steps: parsed.steps ?? null,
      topic: topic === "any" ? null : topic,
    } as any)
    .select("id, hint, solution_steps")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    sessionId: data.id,
    problem_text: parsed.problem_text,
    difficulty,
    opType,
    topic,
    hint: data.hint,
    steps: Array.isArray(data.solution_steps) ? data.solution_steps : [],
  });
}
