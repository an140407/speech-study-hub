export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exam_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          question_ids: Json
          score: number
          total: number
          question_seconds: Json | null
          total_seconds: number | null
          user_id: string | null
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          question_ids: Json
          score: number
          total: number
          question_seconds?: Json | null
          total_seconds?: number | null
          user_id?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          question_ids?: Json
          score?: number
          total?: number
          question_seconds?: Json | null
          total_seconds?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          created_at: string
          front: string
          id: string
          topic_id: string
          subtopic: string | null
          seen_at: string | null
        }
        Insert: {
          back: string
          created_at?: string
          front: string
          id?: string
          topic_id: string
          subtopic?: string | null
          seen_at?: string | null
        }
        Update: {
          back?: string
          created_at?: string
          front?: string
          id?: string
          topic_id?: string
          subtopic?: string | null
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          content: Json
          created_at: string
          id: string
          topic_id: string
          type: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          topic_id: string
          type: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          topic_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_questions: {
        Row: {
          correct_index: number
          created_at: string
          explanation: string
          id: string
          options: Json
          question: string
          topic_id: string
          subtopic: string | null
          seen_at: string | null
          ai_explanation: string | null
        }
        Insert: {
          correct_index: number
          created_at?: string
          explanation?: string
          id?: string
          options: Json
          question: string
          topic_id: string
          subtopic?: string | null
          seen_at?: string | null
          ai_explanation?: string | null
        }
        Update: {
          correct_index?: number
          created_at?: string
          explanation?: string
          id?: string
          options?: Json
          question?: string
          topic_id?: string
          subtopic?: string | null
          seen_at?: string | null
          ai_explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcq_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_cases: {
        Row: {
          id: string
          topic_id: string
          scenario: string
          guiding_questions: Json
          case_explanation: string | null
          created_at: string
        }
        Insert: {
          id?: string
          topic_id: string
          scenario: string
          guiding_questions: Json
          case_explanation?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          topic_id?: string
          scenario?: string
          guiding_questions?: Json
          case_explanation?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_cases_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          id: string
          topic_id: string
          content_type: string
          case_id: string | null
          block_index: number
          start_offset: number
          end_offset: number
          created_at: string
        }
        Insert: {
          id?: string
          topic_id: string
          content_type: string
          case_id?: string | null
          block_index?: number
          start_offset: number
          end_offset: number
          created_at?: string
        }
        Update: {
          id?: string
          topic_id?: string
          content_type?: string
          case_id?: string | null
          block_index?: number
          start_offset?: number
          end_offset?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          id: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_generated_material: {
        Args: {
          p_clinical_case: Json
          p_flashcards: Json
          p_mcq: Json
          p_mindmap: Json
          p_review_questions: Json
          p_summary: string
          p_topic: string
        }
        Returns: string
      }
      add_flashcards: {
        Args: { p_topic_id: string; p_flashcards: Json }
        Returns: number
      }
      add_mcq_questions: {
        Args: { p_topic_id: string; p_mcq: Json }
        Returns: number
      }
      add_clinical_case: {
        Args: {
          p_topic_id: string
          p_scenario: string
          p_guiding_questions: Json
          p_case_explanation: string
        }
        Returns: string
      }
      update_clinical_case_content: {
        Args: { p_case_id: string; p_guiding_questions: Json; p_case_explanation: string }
        Returns: undefined
      }
      set_mcq_explanation: {
        Args: { p_mcq_id: string; p_ai_explanation: string }
        Returns: undefined
      }
      set_flashcard_subtopic: {
        Args: { p_flashcard_id: string; p_subtopic: string }
        Returns: undefined
      }
      set_mcq_subtopic: {
        Args: { p_mcq_id: string; p_subtopic: string }
        Returns: undefined
      }
      mark_flashcard_seen: {
        Args: { p_flashcard_id: string }
        Returns: undefined
      }
      mark_mcq_seen: {
        Args: { p_mcq_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const