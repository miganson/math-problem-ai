import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabase } from "../../../../lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const Body = z.object({
  sessionId: z.string().uuid(),
  userAnswer: z.union([z.number(), z.string()]),
});

function toNum(v: unknown) {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  try {
    const { sessionId, userAnswer } = Body.parse(await req.json());

    // 1) Load session
    const { data: s, error } = await supabase
      .from("math_problem_sessions")
      .select(
        "id, problem_text, correct_answer, hint, solution_steps, difficulty, op_type"
      )
      .eq("id", sessionId)
      .single();

    if (error || !s) {
      return NextResponse.json(
        { error: "Session not found", detail: error?.message },
        { status: 404 }
      );
    }

    // 2) Validate/compare answer
    const userNum = toNum(userAnswer);
    if (!Number.isFinite(userNum)) {
      return NextResponse.json(
        { error: "Answer must be a number" },
        { status: 400 }
      );
    }
    const correct = Number(s.correct_answer);
    const is_correct = Math.abs(userNum - correct) < 1e-9;

    // 3) Feedback (Gemini best-effort, with fallback)
    let feedback = is_correct
      ? "Great job — that's correct!"
      : "Good try! Re-check your arithmetic and give it another go.";

    const key = process.env.GOOGLE_API_KEY;
    if (key) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: "gemini-flash-latest",
        });
        const fbPrompt = `Problem: ${s.problem_text}
Correct numeric answer: ${correct}
Student answer: ${userNum} (${is_correct ? "correct" : "wrong"})
Write friendly feedback in <=3 sentences. If wrong, hint the key step. Return plain text only.`;

        const r = await model.generateContent(fbPrompt);
        const txt = r.response.text().trim();
        if (txt) feedback = txt;
      } catch (gerr: any) {
        console.error("Gemini feedback failed:", gerr?.message || gerr);
        // keep fallback feedback
      }
    }

    // 4) Persist submission
    const { error: insErr } = await supabase
      .from("math_problem_submissions")
      .insert({
        session_id: s.id,
        user_answer: userNum,
        is_correct,
        feedback_text: feedback,
      } as any);

    if (insErr) {
      console.error("DB insert failed:", insErr);
      return NextResponse.json(
        { error: "DB insert failed", detail: insErr.message },
        { status: 500 }
      );
    }

    // 5) Normalize steps (supports jsonb or text)
    let steps: string[] = [];
    if (Array.isArray(s.solution_steps)) steps = s.solution_steps as string[];
    else if (typeof s.solution_steps === "string") {
      try {
        const parsed = JSON.parse(s.solution_steps);
        if (Array.isArray(parsed)) steps = parsed;
      } catch {}
    }

    return NextResponse.json({
      is_correct,
      feedback,
      hint: s.hint,
      steps,
      difficulty: s.difficulty,
      opType: s.op_type,
    });
  } catch (e: any) {
    console.error("Submit handler failed:", e?.message || e);
    return NextResponse.json(
      { error: "Submit handler failed", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
