import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../../../lib/supabaseClient";

const Body = z.object({
  sessionId: z.string().uuid(),
  userAnswer: z.union([z.number(), z.string()]),
});

export async function POST(req: Request) {
  const { sessionId, userAnswer } = Body.parse(await req.json());

  const { data: s, error } = await supabase
    .from("math_problem_sessions")
    .select("id, problem_text, correct_answer")
    .eq("id", sessionId)
    .single();
  if (error || !s)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const toNum = (v: any) => Number(String(v).replace(/,/g, "").trim());
  const userNum = toNum(userAnswer);
  const correct = Number(s.correct_answer);
  const is_correct =
    Number.isFinite(userNum) && Math.abs(userNum - correct) < 1e-6;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
  const fbPrompt = `Problem: ${s.problem_text}
Correct: ${correct}
Student: ${userNum} (${is_correct ? "correct" : "wrong"})
Write <=3 sentences of friendly feedback. Plain text.`;
  const feedback = (await model.generateContent(fbPrompt)).response
    .text()
    .trim();

  const { error: insErr } = await supabase
    .from("math_problem_submissions")
    .insert({
      session_id: s.id,
      user_answer: userNum,
      is_correct,
      // DB column is feedback_text
      feedback_text: feedback,
    });
  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ is_correct, feedback });
}
