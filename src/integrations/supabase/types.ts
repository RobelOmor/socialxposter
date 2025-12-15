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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_batches: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          batch_id: string | null
          bio: string | null
          cookies: string
          created_at: string | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          last_checked: string | null
          posts_count: number | null
          profile_pic_url: string | null
          status: Database["public"]["Enums"]["account_status"] | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          batch_id?: string | null
          bio?: string | null
          cookies: string
          created_at?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          last_checked?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          batch_id?: string | null
          bio?: string | null
          cookies?: string
          created_at?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          last_checked?: string | null
          posts_count?: number | null
          profile_pic_url?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "account_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          photo_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          photo_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          photo_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      photo_service_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          photo_url: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          photo_url: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_service_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "photo_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_limit: number | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          updated_at: string | null
        }
        Insert: {
          account_limit?: number | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          updated_at?: string | null
        }
        Update: {
          account_limit?: number | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_history: {
        Row: {
          admin_id: string
          created_at: string
          expire_at: string | null
          id: string
          new_limit: number | null
          new_plan: Database["public"]["Enums"]["subscription_plan"]
          notes: string | null
          previous_limit: number | null
          previous_plan: Database["public"]["Enums"]["subscription_plan"] | null
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          expire_at?: string | null
          id?: string
          new_limit?: number | null
          new_plan: Database["public"]["Enums"]["subscription_plan"]
          notes?: string | null
          previous_limit?: number | null
          previous_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          expire_at?: string | null
          id?: string
          new_limit?: number | null
          new_plan?: Database["public"]["Enums"]["subscription_plan"]
          notes?: string | null
          previous_limit?: number | null
          previous_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_admin_config: {
        Row: {
          api_hash: string | null
          api_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          max_messages_per_day: number | null
          max_sessions_per_user: number | null
          updated_at: string
          vps_ip: string | null
        }
        Insert: {
          api_hash?: string | null
          api_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_messages_per_day?: number | null
          max_sessions_per_user?: number | null
          updated_at?: string
          vps_ip?: string | null
        }
        Update: {
          api_hash?: string | null
          api_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_messages_per_day?: number | null
          max_sessions_per_user?: number | null
          updated_at?: string
          vps_ip?: string | null
        }
        Relationships: []
      }
      telegram_auto_replies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          reply_template: string
          trigger_keywords: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          reply_template: string
          trigger_keywords?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          reply_template?: string
          trigger_keywords?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          created_at: string
          destination: string
          destination_type: string
          error_message: string | null
          id: string
          message_content: string
          sent_at: string | null
          session_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          destination_type?: string
          error_message?: string | null
          id?: string
          message_content: string
          sent_at?: string | null
          session_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          destination_type?: string
          error_message?: string | null
          id?: string
          message_content?: string
          sent_at?: string | null
          session_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telegram_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_proxies: {
        Row: {
          created_at: string
          id: string
          proxy_host: string
          proxy_password: string | null
          proxy_port: number
          proxy_username: string | null
          status: string | null
          updated_at: string
          used_by_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proxy_host: string
          proxy_password?: string | null
          proxy_port: number
          proxy_username?: string | null
          status?: string | null
          updated_at?: string
          used_by_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proxy_host?: string
          proxy_password?: string | null
          proxy_port?: number
          proxy_username?: string | null
          status?: string | null
          updated_at?: string
          used_by_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_proxies_used_by_session_id_fkey"
            columns: ["used_by_session_id"]
            isOneToOne: false
            referencedRelation: "telegram_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_replies: {
        Row: {
          created_at: string
          from_user: string
          from_user_id: string | null
          id: string
          message_content: string
          replied: boolean | null
          replied_at: string | null
          reply_content: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          from_user: string
          from_user_id?: string | null
          id?: string
          message_content: string
          replied?: boolean | null
          replied_at?: string | null
          reply_content?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          from_user?: string
          from_user_id?: string | null
          id?: string
          message_content?: string
          replied?: boolean | null
          replied_at?: string | null
          reply_content?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_replies_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telegram_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_sessions: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          messages_sent: number | null
          phone_number: string
          proxy_host: string | null
          proxy_password: string | null
          proxy_port: number | null
          proxy_username: string | null
          replies_received: number | null
          session_data: string
          session_name: string | null
          status: string
          telegram_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          messages_sent?: number | null
          phone_number: string
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
          proxy_username?: string | null
          replies_received?: number | null
          session_data: string
          session_name?: string | null
          status?: string
          telegram_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          messages_sent?: number | null
          phone_number?: string
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
          proxy_username?: string | null
          replies_received?: number | null
          session_data?: string
          session_name?: string | null
          status?: string
          telegram_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_status: "active" | "expired" | "pending" | "suspended"
      app_role: "admin" | "moderator" | "user"
      subscription_plan: "free" | "premium"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "expired", "pending", "suspended"],
      app_role: ["admin", "moderator", "user"],
      subscription_plan: ["free", "premium"],
    },
  },
} as const
