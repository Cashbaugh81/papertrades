// Generated from the Supabase schema (project rolvlgtxjrcsczinhgbf) on
// 2026-11-12 after migration comparison_sets (hand-updated; regenerate to confirm). Regenerate after schema changes.
// Helper generics trimmed; supabase-js only needs `Database`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      comparison_sets: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          initial: number;
          start_date: string;
          user_id: string;
          weekly: number;
          what_if: boolean;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          initial: number;
          start_date: string;
          user_id?: string;
          weekly?: number;
          what_if: boolean;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          initial?: number;
          start_date?: string;
          user_id?: string;
          weekly?: number;
          what_if?: boolean;
        };
        Relationships: [];
      };
      portfolios: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          set_id: string;
          slot: number;
          start_date: string;
          thesis: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          set_id: string;
          slot: number;
          start_date: string;
          thesis?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          set_id?: string;
          slot?: number;
          start_date?: string;
          thesis?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      prices: {
        Row: { close: number; date: string; ticker: string };
        Insert: { close: number; date: string; ticker: string };
        Update: { close?: number; date?: string; ticker?: string };
        Relationships: [
          {
            foreignKeyName: "prices_ticker_fkey";
            columns: ["ticker"];
            isOneToOne: false;
            referencedRelation: "tickers";
            referencedColumns: ["ticker"];
          },
        ];
      };
      tickers: {
        Row: {
          error: string | null;
          fetched_at: string | null;
          first_date: string | null;
          last_date: string | null;
          name: string | null;
          status: string;
          ticker: string;
        };
        Insert: {
          error?: string | null;
          fetched_at?: string | null;
          first_date?: string | null;
          last_date?: string | null;
          name?: string | null;
          status?: string;
          ticker: string;
        };
        Update: {
          error?: string | null;
          fetched_at?: string | null;
          first_date?: string | null;
          last_date?: string | null;
          name?: string | null;
          status?: string;
          ticker?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          amount: number | null;
          created_at: string;
          fill_amount: number | null;
          fill_price: number | null;
          fill_units: number | null;
          filled_on: string | null;
          id: string;
          kind: string;
          note: string | null;
          placed_at: string | null;
          portfolio_id: string;
          processed_at: string | null;
          reject_reason: string | null;
          status: string;
          ticker: string | null;
          trade_date: string;
          units: number | null;
          user_id: string;
          weights: Json | null;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          fill_amount?: number | null;
          fill_price?: number | null;
          fill_units?: number | null;
          filled_on?: string | null;
          id?: string;
          kind: string;
          note?: string | null;
          placed_at?: string | null;
          portfolio_id: string;
          processed_at?: string | null;
          reject_reason?: string | null;
          status?: string;
          ticker?: string | null;
          trade_date: string;
          units?: number | null;
          user_id?: string;
          weights?: Json | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          fill_amount?: number | null;
          fill_price?: number | null;
          fill_units?: number | null;
          filled_on?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          placed_at?: string | null;
          portfolio_id?: string;
          processed_at?: string | null;
          reject_reason?: string | null;
          status?: string;
          ticker?: string | null;
          trade_date?: string;
          units?: number | null;
          user_id?: string;
          weights?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_comparison_set: {
        Args: { p_start_date: string; p_initial: number; p_weekly: number; p_columns: Json };
        Returns: string;
      };
      add_column: {
        Args: { p_set: string; p_slot: number; p_name: string; p_weights: Json };
        Returns: string;
      };
      replace_column: {
        Args: { p_portfolio: string; p_weights: Json; p_name?: string; p_note?: string };
        Returns: string;
      };
      price_series: {
        Args: { p_tickers: string[]; p_from?: string };
        Returns: { ticker: string; dates: string[]; closes: number[] }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
