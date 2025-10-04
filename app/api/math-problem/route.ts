import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { supabase } from "../../../lib/supabaseClient";

export const runtime = "nodejs";

const Problem = z.object({
  problem_text: z.string().min(10),
  final_answer: z.number(),
});

export async function POST() {
  const key = process.env.GOOGLE_API_KEY!;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `Return ONLY JSON: {"problem_text": string, "final_answer": number} for a Primary 5 word problem.`;
  const r = await model.generateContent(prompt);
  const txt = r.response.text().trim();

  const parsed = Problem.parse(JSON.parse(txt));

  const { data, error } = await supabase
    .from("math_problem_sessions")
    .insert({
      problem_text: parsed.problem_text,
      // DB column is correct_answer
      correct_answer: parsed.final_answer,
    })
    .select("id")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    sessionId: data.id,
    problem_text: parsed.problem_text,
  });
}
