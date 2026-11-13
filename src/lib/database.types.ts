// Generated from the Supabase schema (project rolvlgtxjrcsczinhgbf) on
// 2026-11-12 after migration core_schema. Regenerate after schema changes.
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
      portfolios: {
        Row: {
          created_at: string;
          example: boolean;
          id: string;
          initial: number;
          monthly: number;
          name: string;
          start_date: string;
          thesis: string;
          user_id: string;
          weights: Json | null;
        };
        Insert: {
          created_at?: string;
          example?: boolean;
          id?: string;
          initial?: number;
          monthly?: number;
          name: string;
          start_date: string;
          thesis?: string;
          user_id?: string;
          weights?: Json | null;
        };
        Update: {
          created_at?: string;
          example?: boolean;
          id?: string;
          initial?: number;
          monthly?: number;
          name?: string;
          start_date?: string;
          thesis?: string;
          user_id?: string;
          weights?: Json | null;
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
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
