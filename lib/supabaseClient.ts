import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  if (!_client) _client = createClient(url, anon);
  return _client;
}

export type Database = {
  public: {
    Tables: {
      math_problem_sessions: {
        Row: {
          id: string;
          created_at: string;
          problem_text: string;
          correct_answer: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          problem_text: string;
          correct_answer: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          problem_text?: string;
          correct_answer?: number;
        };
      };
      math_problem_submissions: {
        Row: {
          id: string;
          session_id: string;
          user_answer: number;
          is_correct: boolean;
          feedback_text: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_answer: number;
          is_correct: boolean;
          feedback_text: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_answer?: number;
          is_correct?: boolean;
          feedback_text?: string;
        };
      };
    };
  };
};
