// app/page.tsx
"use client";

import { useState } from "react";

interface MathProblem {
  problem_text: string;
  final_answer: number;
}
type Diff = "easy" | "medium" | "hard";

export default function Home() {
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [difficulty, setDifficulty] = useState<Diff>("medium");
  const [pressingGen, setPressingGen] = useState(false);
  const [pressingSubmit, setPressingSubmit] = useState(false);

  const generateProblem = async () => {
    setIsLoading(true);
    setFeedback("");
    setIsCorrect(null);
    setUserAnswer("");
    try {
      const res = await fetch("/api/math-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to generate problem");
      setSessionId(j.sessionId);
      setProblem({ problem_text: j.problem_text, final_answer: 0 });
    } catch (e: any) {
      setFeedback(`Error: ${e.message ?? "generate failed"}`);
      setIsCorrect(false);
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
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Submit failed");
      setIsCorrect(!!j.is_correct);
      setFeedback(j.feedback as string);
    } catch (e: any) {
      setIsCorrect(false);
      setFeedback(`Error: ${e.message ?? "submit failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-white to-white text-gray-900 antialiased">
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:max-w-2xl sm:py-12">
        {/* Header */}

        <header className="mb-6 text-center sm:mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-medium text-sky-700 shadow-sm backdrop-blur">
            <span>🧮</span> <span>Practice Mode</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Math Problem Generator
          </h1>
          <p className="mx-auto mt-2 max-w-prose text-sm text-gray-600">
            Generate a fresh problem, type your answer, and get instant
            feedback.
          </p>
        </header>

        {/* Difficulty selector */}
        <div
          role="radiogroup"
          aria-label="Difficulty"
          className="mb-4 grid grid-cols-3 gap-2"
        >
          {(["easy", "medium", "hard"] as Diff[]).map((d) => {
            const selected = difficulty === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDifficulty(d)}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border shadow-sm
                  ${
                    selected
                      ? "bg-sky-600 text-white border-sky-600 ring-2 ring-sky-300"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
              >
                <span>{d[0].toUpperCase() + d.slice(1)}</span>
              </button>
            );
          })}
        </div>

        {/* Generate */}
        <section className="mb-6 sm:mb-8">
          <button
            onPointerDown={() => {
              setPressingGen(true);
              setTimeout(() => setPressingGen(false), 140);
            }}
            onClick={generateProblem}
            disabled={isLoading}
            className={`group relative w-full overflow-hidden rounded-xl bg-sky-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition
                        focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-gray-300
                        ${
                          pressingGen
                            ? "translate-y-0.5 scale-[0.99] shadow-inner"
                            : ""
                        }`}
          >
            <span
              className={`inline-flex items-center justify-center gap-2 ${
                isLoading ? "opacity-70" : ""
              }`}
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating…
                </>
              ) : (
                <>Generate New Problem</>
              )}
            </span>
          </button>
        </section>

        {/* Problem + Answer */}
        {problem && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-gray-800">Problem</h2>
            <p className="mt-2 rounded-lg bg-gray-50 p-4 text-lg leading-relaxed sm:text-xl">
              {problem.problem_text}
            </p>

            <form onSubmit={submitAnswer} className="mt-5 space-y-4">
              <label
                htmlFor="answer"
                className="block text-sm font-medium text-gray-700"
              >
                Your Answer
              </label>
              <div className="flex w-full items-center gap-3">
                <input
                  id="answer"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9,.]*"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-2/3 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base outline-none ring-0 transition placeholder:text-gray-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 sm:py-3"
                  required
                />
                <button
                  type="submit"
                  onPointerDown={() => {
                    setPressingSubmit(true);
                    setTimeout(() => setPressingSubmit(false), 140);
                  }}
                  disabled={!userAnswer || isLoading}
                  className={`inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition
                              hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200
                              disabled:cursor-not-allowed disabled:bg-gray-300 sm:text-base sm:py-3
                              ${
                                pressingSubmit
                                  ? "translate-y-0.5 scale-[0.99] shadow-inner"
                                  : ""
                              }`}
                >
                  {isLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Checking…
                    </>
                  ) : (
                    <>Submit</>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Feedback */}
        {feedback && (
          <section
            className={[
              "rounded-2xl border p-5 shadow-sm sm:p-6",
              isCorrect
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50",
            ].join(" ")}
          >
            <h3 className="mb-2 text-lg font-semibold">
              {isCorrect ? "✅ Correct!" : "❌ Not quite right"}
            </h3>
            <p className="text-gray-800">{feedback}</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={generateProblem}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:text-base"
              >
                Try another
              </button>
              {problem && (
                <button
                  onClick={() => {
                    setUserAnswer("");
                    setFeedback("");
                    setIsCorrect(null);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black sm:text-base"
                >
                  Change answer
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
