import { NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0; 
export const fetchCache = "force-no-store";

const LAST_N_FOR_SCORE = 100;

export async function GET(req: Request) {
  const supabase = getSupabase();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    50,
    Math.max(5, Number(url.searchParams.get("pageSize") || 10))
  );

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("math_problem_sessions")
    .select(
      "id, created_at, problem_text, difficulty, op_type, topic, math_problem_submissions ( is_correct, created_at )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data || []) as any[];
  const items = sessions.map((s) => {
    const subs = (s.math_problem_submissions || []) as any[];
    const latest = subs.sort((a, b) =>
      a.created_at > b.created_at ? -1 : 1
    )[0];
    return {
      id: s.id as string,
      created_at: s.created_at as string,
      problem_text: s.problem_text as string,
      difficulty: s.difficulty ?? null,
      opType: s.op_type ?? null,
      topic: s.topic ?? null,
      latest_correct:
        latest && typeof latest.is_correct === "boolean"
          ? !!latest.is_correct
          : null,
    };
  });

  const { data: scoreData, error: scoreErr } = await supabase
    .from("math_problem_sessions")
    .select("id, math_problem_submissions ( is_correct, created_at )")
    .order("created_at", { ascending: false })
    .range(0, LAST_N_FOR_SCORE - 1);

  if (scoreErr) {
    return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  }

  const scoredItems = (scoreData || []).map((s: any) => {
    const latest = (s.math_problem_submissions || []).sort((a: any, b: any) =>
      a.created_at > b.created_at ? -1 : 1
    )[0];
    return typeof latest?.is_correct === "boolean" ? latest.is_correct : null;
  });

  const score = {
    total: scoredItems.filter((x) => x !== null).length,
    correct: scoredItems.filter((x) => x === true).length,
  };

  const total = count ?? items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    items,
    score,
    page,
    pageSize,
    total,
    pageCount,
    hasMore: page < pageCount,
  });
}
