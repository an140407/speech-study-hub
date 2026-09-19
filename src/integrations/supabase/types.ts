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
      clinical_cases: {
        Row: {
          case_explanation: string | null
          created_at: string
          guiding_questions: Json
          id: string
          scenario: string
          topic_id: string
        }
        Insert: {
          case_explanation?: string | null
          created_at?: string
          guiding_questions: Json
          id?: string
          scenario: string
          topic_id: string
        }
        Update: {
          case_explanation?: string | null
          created_at?: string
          guiding_questions?: Json
          id?: string
          scenario?: string
          topic_id?: string
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
      exam_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          question_ids: Json
          question_seconds: Json | null
          score: number
          total: number
          total_seconds: number | null
          user_id: string | null
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          question_ids: Json
          question_seconds?: Json | null
          score: number
          total: number
          total_seconds?: number | null
          user_id?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          question_ids?: Json
          question_seconds?: Json | null
          score?: number
          total?: number
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
          seen_at: string | null
          subtopic: string | null
          topic_id: string
        }
        Insert: {
          back: string
          created_at?: string
          front: string
          id?: string
          seen_at?: string | null
          subtopic?: string | null
          topic_id: string
        }
        Update: {
          back?: string
          created_at?: string
          front?: string
          id?: string
          seen_at?: string | null
          subtopic?: string | null
          topic_id?: string
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
      highlights: {
        Row: {
          block_index: number
          case_id: string | null
          content_type: string
          created_at: string
          end_offset: number
          id: string
          start_offset: number
          topic_id: string
        }
        Insert: {
          block_index?: number
          case_id?: string | null
          content_type: string
          created_at?: string
          end_offset: number
          id?: string
          start_offset: number
          topic_id: string
        }
        Update: {
          block_index?: number
          case_id?: string | null
          content_type?: string
          created_at?: string
          end_offset?: number
          id?: string
          start_offset?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_topic_id_fkey"
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
          ai_explanation: string | null
          correct_index: number
          created_at: string
          explanation: string
          id: string
          options: Json
          question: string
          seen_at: string | null
          subtopic: string | null
          topic_id: string
        }
        Insert: {
          ai_explanation?: string | null
          correct_index: number
          created_at?: string
          explanation?: string
          id?: string
          options: Json
          question: string
          seen_at?: string | null
          subtopic?: string | null
          topic_id: string
        }
        Update: {
          ai_explanation?: string | null
          correct_index?: number
          created_at?: string
          explanation?: string
          id?: string
          options?: Json
          question?: string
          seen_at?: string | null
          subtopic?: string | null
          topic_id?: string
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
      add_clinical_case: {
        Args: {
          p_case_explanation: string
          p_guiding_questions: Json
          p_scenario: string
          p_topic_id: string
        }
        Returns: string
      }
      add_flashcards: {
        Args: { p_flashcards: Json; p_topic_id: string }
        Returns: number
      }
      add_mcq_questions: {
        Args: { p_mcq: Json; p_topic_id: string }
        Returns: number
      }
      mark_flashcard_seen: {
        Args: { p_flashcard_id: string }
        Returns: undefined
      }
      mark_mcq_seen: { Args: { p_mcq_id: string }; Returns: undefined }
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
      set_flashcard_subtopic: {
        Args: { p_flashcard_id: string; p_subtopic: string }
        Returns: undefined
      }
      set_mcq_explanation: {
        Args: { p_ai_explanation: string; p_mcq_id: string }
        Returns: undefined
      }
      set_mcq_subtopic: {
        Args: { p_mcq_id: string; p_subtopic: string }
        Returns: undefined
      }
      update_clinical_case_content: {
        Args: {
          p_case_explanation: string
          p_case_id: string
          p_guiding_questions: Json
        }
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
