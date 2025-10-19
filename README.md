# Math Problem Generator - Developer Assessment Starter Kit

## Overview

This is a starter kit for building an AI-powered math problem generator application. The goal is to create a standalone prototype that uses AI to generate math word problems suitable for Primary 5 students, saves the problems and user submissions to a database, and provides personalized feedback.

## Tech Stack

- **Frontend Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase
- **AI Integration**: Google Generative AI (Gemini)

### My Implementation:

- POST /api/math-problem generates a Primary 5 word problem via Gemini (gemini-flash-latest) and saves it to math_problem_sessions (problem_text, correct_answer, optional hint, solution_steps).

- POST /api/math-problem/submit stores each submission in math_problem_submissions (session_id, user_answer, is_correct, feedback_text) and returns personalized feedback (Gemini best-effort with a friendly fallback).

- UI controls for difficulty (easy/medium/hard), operation (any/add/sub/mul/div), and topic (mapped to P5 syllabus buckets). These constrain the generation prompt to keep questions on-level and on-topic.

- Responsive, accessible UI (Tailwind)

- History table with headers for clarity (When, Diff, Op, Topic, Result, Problem).

- History with server-side pagination

- GET /api/math-problem/history returns items, total, pageCount, plus an accuracy score computed over the latest 100 sessions (not just the current page).

**Supabase Credentials**
```
NEXT_PUBLIC_SUPABASE_URL=https://dwnwegbssgedezfyhzly.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_eA7ugXc8slv27gZ5Hkh8TQ_tyhW_NPD
```
*(Keys provided above are public anon keys intended for demo evaluation only.)*


## Additional Features (Optional)

If you have time, consider adding:

- [x] Difficulty levels (Easy/Medium/Hard)
- [x] Problem history view
- [x] Score tracking
- [x] Different problem types (addition, subtraction, multiplication, division)
- [x] Hints system
- [x] Step-by-step solution explanations
