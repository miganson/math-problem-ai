// app/page.tsx
"use client";

import { useEffect, useState } from "react";

type Diff = "easy" | "medium" | "hard";
type Op = "any" | "add" | "sub" | "mul" | "div";

interface MathProblem {
  problem_text: string;
  final_answer: number;
}
interface HistoryItem {
  id: string;
  created_at: string;
  problem_text: string;
  difficulty: Diff | null;
  opType: Op | null;
  latest_correct: boolean | null;
}

const diffLabel = (d: Diff) => d.charAt(0).toUpperCase() + d.slice(1);
const opLabel: Record<Op, string> = {
  any: "Any operation",
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
};

const opShort: Record<Op, string> = {
  any: "Any",
  add: "Add",
  sub: "Subtract",
  mul: "Multiply",
  div: "Divide",
};

export default function Home() {
  // UI state
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // controls for generating
  const [difficulty, setDifficulty] = useState<Diff>("medium");
  const [opType, setOpType] = useState<Op>("any");

  // what the current card actually is
  const [displayDifficulty, setDisplayDifficulty] = useState<Diff | null>(null);
  const [displayOp, setDisplayOp] = useState<Op | null>(null);

  // helpers
  const [hint, setHint] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  // history + score
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [score, setScore] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < pageCount;

  // ---------- utils ----------
  const safeParseJson = (status: number, bodyText: string) => {
    try {
      return bodyText ? JSON.parse(bodyText) : {};
    } catch {
      throw new Error(
        `Bad response (${status}). Body: ${bodyText.slice(0, 160) || "empty"}`
      );
    }
  };

  const fetchHistoryPage = async (p = page) => {
    const r = await fetch(
      `/api/math-problem/history?page=${p}&pageSize=${pageSize}`,
      {
        cache: "no-store",
      }
    );
    const text = await r.text();
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      console.error("history not JSON:", r.status, text.slice(0, 160));
      return;
    }
    const j = safeParseJson(r.status, text);
    if (r.ok) {
      setHistory(j.items as HistoryItem[]);
      setScore(j.score);
      setTotal(j.total ?? (j.items?.length || 0));
    } else {
      console.error("history load failed:", j.error || `HTTP ${r.status}`);
    }
  };

  useEffect(() => {
    fetchHistoryPage(1).catch((e) =>
      console.error("history initial load failed:", e)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when page changes via UI
  const goToPage = async (p: number) => {
    setPage(p);
    await fetchHistoryPage(p);
  };

  // ---------- actions ----------
  const generateProblem = async () => {
    setIsLoading(true);
    setFeedback("");
    setIsCorrect(null);
    setUserAnswer("");
    setShowHint(false);
    setShowSteps(false);

    try {
      const res = await fetch("/api/math-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, opType }),
      });

      const text = await res.text();
      const j = safeParseJson(res.status, text);
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      setSessionId(j.sessionId);
      setProblem({ problem_text: j.problem_text, final_answer: 0 });
      setHint(j.hint ?? null);
      setSteps(Array.isArray(j.steps) ? j.steps : []);
      setDisplayDifficulty((j.difficulty as Diff) ?? difficulty);
      setDisplayOp((j.opType as Op) ?? opType);

      // new item appears on page 1; keep UX simple: jump to page 1
      await goToPage(1);
    } catch (e: any) {
      setIsCorrect(false);
      setFeedback(`Error: ${e.message ?? "generate failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;

    setIsLoading(true);
    setFeedback("");

    try {
      const res = await fetch("/api/math-problem/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userAnswer }),
      });

      const text = await res.text();
      const j = safeParseJson(res.status, text);
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      setIsCorrect(!!j.is_correct);
      setFeedback(j.feedback as string);
      if (Array.isArray(j.steps)) setSteps(j.steps);
      if (j.hint) setHint(j.hint);

      // stay on current page; still refresh it
      await fetchHistoryPage(page);
    } catch (e: any) {
      setIsCorrect(false);
      setFeedback(`Error: ${e.message ?? "submit failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- render ----------
  const { correct, total: totalAnswered } = score;
  const pct = totalAnswered ? Math.round((correct / totalAnswered) * 100) : 0;
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";

  const bannerDiff = (displayDifficulty ?? difficulty) as Diff;
  const bannerOp = (displayOp ?? opType) as Op;
  const bannerPrefix = problem ? "This question:" : "Next question will be:";

  const fromIndex = (page - 1) * pageSize + 1;
  const toIndex = Math.min(page * pageSize, total);

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-white to-white text-gray-900">
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:max-w-2xl sm:py-12">
        {/* Header + score */}
        <header className="mb-4 text-center sm:mb-6">
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Math Problem Generator
          </h1>
          <p className="mx-auto mt-2 max-w-prose text-sm text-gray-600">
            Generate, answer, get feedback.
          </p>
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">Accuracy:</span>
              <span className="font-semibold">{pct}%</span>
              <span className="text-gray-500">
                ({correct} / {totalAnswered} correct)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full ${color} transition-[width]`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </header>

        {/* Top label describing difficulty + operation */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-gray-600">{bannerPrefix}</span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
            Difficulty: {diffLabel(bannerDiff)}
          </span>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
            Operation: {opLabel[bannerOp]}
          </span>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as Diff[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-xl px-3 py-2 text-sm font-medium border shadow-sm ${
                difficulty === d
                  ? "bg-sky-600 text-white border-sky-600 ring-2 ring-sky-300"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {diffLabel(d)}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {(["any", "add", "sub", "mul", "div"] as Op[]).map((o) => (
            <button
              key={o}
              onClick={() => setOpType(o)}
              className={`rounded-xl px-3 py-2 text-xs sm:text-sm border shadow-sm whitespace-nowrap ${
                opType === o
                  ? "bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
              title={opLabel[o]}
            >
              <span className="sm:hidden">{opShort[o]}</span>
              <span className="hidden sm:inline">{opLabel[o]}</span>
            </button>
          ))}
        </div>

        <section className="mt-4 mb-6">
          <button
            onClick={generateProblem}
            disabled={isLoading}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-gray-300"
          >
            {isLoading ? "Generating…" : "Generate New Problem"}
          </button>
        </section>

        {/* Problem card */}
        {problem && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">
                {diffLabel((displayDifficulty ?? difficulty) as Diff)} Problem
              </h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {opLabel[(displayOp ?? opType) as Op]}
              </span>
            </div>

            <p className="mt-2 rounded-lg bg-gray-50 p-4 text-lg leading-relaxed sm:text-xl">
              {problem.problem_text}
            </p>

            {/* Hint / steps toggles */}
            <div className="mt-3 flex flex-wrap gap-2">
              {hint && (
                <button
                  onClick={() => setShowHint((v) => !v)}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
                >
                  {showHint ? "Hide hint" : "Show hint"}
                </button>
              )}
              {steps.length > 0 && (
                <button
                  onClick={() => setShowSteps((v) => !v)}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800"
                >
                  {showSteps ? "Hide solution" : "Show solution"}
                </button>
              )}
            </div>

            {showHint && hint && (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {hint}
              </p>
            )}

            {showSteps && steps.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}

            {/* Answer form */}
            <form onSubmit={submitAnswer} className="mt-5 space-y-3">
              <label
                htmlFor="answer"
                className="block text-sm font-medium text-gray-700"
              >
                Your Answer
              </label>

              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  id="answer"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9,.]*"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base placeholder:text-gray-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 sm:flex-1 sm:py-3"
                  required
                />
                <button
                  type="submit"
                  disabled={!userAnswer || isLoading}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-gray-300 sm:w-auto sm:min-w-[7.5rem] sm:py-3"
                >
                  {isLoading ? "Checking…" : "Submit"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* History with pagination */}
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">History</h4>
            <div className="text-xs text-gray-500">
              Showing {total ? fromIndex : 0}-{toIndex} of {total}
            </div>
          </div>

          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-start gap-3 bg-white px-4 py-3"
              >
                <span className="w-5 text-center">
                  {h.latest_correct === null
                    ? "–"
                    : h.latest_correct
                    ? "✅"
                    : "❌"}
                </span>

                <span className="rounded bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
                  {h.difficulty ?? "medium"}
                </span>

                <span className="rounded bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
                  {h.opType ?? "any"}
                </span>

                {/* let the text take remaining width and wrap */}
                <span className="min-w-0 flex-1 text-sm text-gray-800 whitespace-normal break-words">
                  {h.problem_text}
                </span>
              </li>
            ))}
          </ul>

          {/* Pager */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={!canPrev}
              className={`rounded-lg border px-3 py-1.5 ${
                canPrev
                  ? "bg-white hover:bg-gray-50"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              ← Prev
            </button>
            <span className="text-gray-600">
              Page <span className="font-semibold">{page}</span> of{" "}
              <span className="font-semibold">{pageCount}</span>
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={!canNext}
              className={`rounded-lg border px-3 py-1.5 ${
                canNext
                  ? "bg-white hover:bg-gray-50"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              Next →
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
