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
      attendance_audit_log: {
        Row: {
          created_at: string
          edited_by: string
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          record_id: string
        }
        Insert: {
          created_at?: string
          edited_by: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id: string
        }
        Update: {
          created_at?: string
          edited_by?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_audit_log_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_punches: {
        Row: {
          adopted: boolean
          created_at: string
          employee_id: string
          id: string
          kind: string
          lat: number | null
          lng: number | null
          punched_at: string
          via_override: boolean
        }
        Insert: {
          adopted?: boolean
          created_at?: string
          employee_id: string
          id?: string
          kind: string
          lat?: number | null
          lng?: number | null
          punched_at?: string
          via_override?: boolean
        }
        Update: {
          adopted?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          punched_at?: string
          via_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attendance_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in_at: string | null
          check_in_distance_m: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_out_at: string | null
          check_out_distance_m: number | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          early_leave_deduction_amount: number
          early_leave_minutes: number
          employee_id: string
          id: string
          late_deduction_amount: number
          late_minutes: number
          manually_edited: boolean
          notes: string | null
          selfie_in_path: string | null
          selfie_out_path: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          verification_method: Database["public"]["Enums"]["verification_method"]
          work_date: string
        }
        Insert: {
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          early_leave_deduction_amount?: number
          early_leave_minutes?: number
          employee_id: string
          id?: string
          late_deduction_amount?: number
          late_minutes?: number
          manually_edited?: boolean
          notes?: string | null
          selfie_in_path?: string | null
          selfie_out_path?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          work_date?: string
        }
        Update: {
          check_in_at?: string | null
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          early_leave_deduction_amount?: number
          early_leave_minutes?: number
          employee_id?: string
          id?: string
          late_deduction_amount?: number
          late_minutes?: number
          manually_edited?: boolean
          notes?: string | null
          selfie_in_path?: string | null
          selfie_out_path?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_rules: {
        Row: {
          absence_calc_mode: string
          absence_deduction: number
          allowed_ip_ranges: string[]
          checkin_window_after_min: number
          checkin_window_before_min: number
          checkout_window_after_min: number
          checkout_window_before_min: number
          created_at: string
          department_id: string | null
          early_leave_deduction_enabled: boolean
          early_leave_deduction_per_minute: number
          early_leave_grace_minutes: number
          early_window_start: string | null
          flex_enabled: boolean
          geo_lat: number | null
          geo_lng: number | null
          geo_radius_m: number
          half_day_deduction: number
          id: string
          late_deduction_per_minute: number
          late_grace_minutes: number
          late_window_end: string | null
          network_label: string | null
          require_geo: boolean
          require_selfie: boolean
          require_webauthn: boolean
          tiered_late_deduction: Json
          updated_at: string
          work_end: string
          work_start: string
        }
        Insert: {
          absence_calc_mode?: string
          absence_deduction?: number
          allowed_ip_ranges?: string[]
          checkin_window_after_min?: number
          checkin_window_before_min?: number
          checkout_window_after_min?: number
          checkout_window_before_min?: number
          created_at?: string
          department_id?: string | null
          early_leave_deduction_enabled?: boolean
          early_leave_deduction_per_minute?: number
          early_leave_grace_minutes?: number
          early_window_start?: string | null
          flex_enabled?: boolean
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number
          half_day_deduction?: number
          id?: string
          late_deduction_per_minute?: number
          late_grace_minutes?: number
          late_window_end?: string | null
          network_label?: string | null
          require_geo?: boolean
          require_selfie?: boolean
          require_webauthn?: boolean
          tiered_late_deduction?: Json
          updated_at?: string
          work_end?: string
          work_start?: string
        }
        Update: {
          absence_calc_mode?: string
          absence_deduction?: number
          allowed_ip_ranges?: string[]
          checkin_window_after_min?: number
          checkin_window_before_min?: number
          checkout_window_after_min?: number
          checkout_window_before_min?: number
          created_at?: string
          department_id?: string | null
          early_leave_deduction_enabled?: boolean
          early_leave_deduction_per_minute?: number
          early_leave_grace_minutes?: number
          early_window_start?: string | null
          flex_enabled?: boolean
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number
          half_day_deduction?: number
          id?: string
          late_deduction_per_minute?: number
          late_grace_minutes?: number
          late_window_end?: string | null
          network_label?: string | null
          require_geo?: boolean
          require_selfie?: boolean
          require_webauthn?: boolean
          tiered_late_deduction?: Json
          updated_at?: string
          work_end?: string
          work_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      bonuses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          period_month: string
          reason: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          period_month: string
          reason?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          period_month?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonuses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_audit_log: {
        Row: {
          actor_id: string | null
          contract_id: string
          created_at: string
          details: Json
          event: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          contract_id: string
          created_at?: string
          details?: Json
          event: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          contract_id?: string
          created_at?: string
          details?: Json
          event?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body: string
          clauses: Json
          contract_type: string
          created_at: string
          created_by: string | null
          default_approval_flow: Json
          department: string
          description: string | null
          id: string
          is_active: boolean
          jurisdiction: string
          language: string
          name: string
          tags: string[]
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          clauses?: Json
          contract_type?: string
          created_at?: string
          created_by?: string | null
          default_approval_flow?: Json
          department?: string
          description?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          language?: string
          name: string
          tags?: string[]
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          clauses?: Json
          contract_type?: string
          created_at?: string
          created_by?: string | null
          default_approval_flow?: Json
          department?: string
          description?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          language?: string
          name?: string
          tags?: string[]
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      contracts: {
        Row: {
          allowances: number | null
          approval_flow: Json
          body: string
          clauses: Json
          created_at: string
          created_by: string | null
          data: Json
          effective_date: string | null
          employee_id: string
          employee_note: string | null
          employee_note_at: string | null
          id: string
          kind: string
          manager_approved_at: string | null
          manager_approved_by: string | null
          parent_contract_id: string | null
          pdf_url: string | null
          pending_employee_fields: Json
          salary: number | null
          sent_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          allowances?: number | null
          approval_flow?: Json
          body: string
          clauses?: Json
          created_at?: string
          created_by?: string | null
          data?: Json
          effective_date?: string | null
          employee_id: string
          employee_note?: string | null
          employee_note_at?: string | null
          id?: string
          kind?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          parent_contract_id?: string | null
          pdf_url?: string | null
          pending_employee_fields?: Json
          salary?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          allowances?: number | null
          approval_flow?: Json
          body?: string
          clauses?: Json
          created_at?: string
          created_by?: string | null
          data?: Json
          effective_date?: string | null
          employee_id?: string
          employee_note?: string | null
          employee_note_at?: string | null
          id?: string
          kind?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          parent_contract_id?: string | null
          pdf_url?: string | null
          pending_employee_fields?: Json
          salary?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      deductions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          period_month: string
          reason: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          period_month: string
          reason?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          period_month?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          document_number: string | null
          employee_id: string
          expiry_date: string | null
          file_size: number | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          mime_type: string | null
          notes: string | null
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          document_number?: string | null
          employee_id: string
          expiry_date?: string | null
          file_size?: number | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          mime_type?: string | null
          notes?: string | null
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          document_number?: string | null
          employee_id?: string
          expiry_date?: string | null
          file_size?: number | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          mime_type?: string | null
          notes?: string | null
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          shift_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          shift_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          shift_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          allowances: number
          bank_name: string | null
          base_salary: number
          created_at: string
          department_id: string | null
          employee_no: string | null
          hire_date: string
          iban: string | null
          id: string
          national_id: string | null
          position: string
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          allowances?: number
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          hire_date?: string
          iban?: string | null
          id?: string
          national_id?: string | null
          position?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          allowances?: number
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          hire_date?: string
          iban?: string | null
          id?: string
          national_id?: string | null
          position?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          average: number
          commitment: number
          created_at: string
          employee_id: string
          evaluator_id: string
          id: string
          notes: string | null
          performance: number
          period: string
          quality: number
          teamwork: number
          updated_at: string
        }
        Insert: {
          average?: number
          commitment: number
          created_at?: string
          employee_id: string
          evaluator_id: string
          id?: string
          notes?: string | null
          performance: number
          period: string
          quality: number
          teamwork: number
          updated_at?: string
        }
        Update: {
          average?: number
          commitment?: number
          created_at?: string
          employee_id?: string
          evaluator_id?: string
          id?: string
          notes?: string | null
          performance?: number
          period?: string
          quality?: number
          teamwork?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          country: string
          created_at: string
          end_date: string
          id: string
          kind: Database["public"]["Enums"]["holiday_kind"]
          name_ar: string
          name_en: string
          notes: string | null
          paid: boolean
          start_date: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          end_date: string
          id?: string
          kind?: Database["public"]["Enums"]["holiday_kind"]
          name_ar: string
          name_en: string
          notes?: string | null
          paid?: boolean
          start_date: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          end_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["holiday_kind"]
          name_ar?: string
          name_en?: string
          notes?: string | null
          paid?: boolean
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          applied_count: number
          created_at: string
          department_id: string | null
          employee_id: string | null
          errors_json: Json
          filename: string | null
          id: string
          kind: Database["public"]["Enums"]["import_kind"]
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          rows_json: Json
          scope: Database["public"]["Enums"]["import_scope"]
          status: Database["public"]["Enums"]["import_status"]
          submitted_by: string
          total_count: number
          updated_at: string
        }
        Insert: {
          applied_count?: number
          created_at?: string
          department_id?: string | null
          employee_id?: string | null
          errors_json?: Json
          filename?: string | null
          id?: string
          kind: Database["public"]["Enums"]["import_kind"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          rows_json?: Json
          scope: Database["public"]["Enums"]["import_scope"]
          status?: Database["public"]["Enums"]["import_status"]
          submitted_by: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          applied_count?: number
          created_at?: string
          department_id?: string | null
          employee_id?: string | null
          errors_json?: Json
          filename?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["import_kind"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          rows_json?: Json
          scope?: Database["public"]["Enums"]["import_scope"]
          status?: Database["public"]["Enums"]["import_status"]
          submitted_by?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          carried_over: number
          created_at: string
          employee_id: string
          entitled_days: number
          id: string
          leave_type_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          carried_over?: number
          created_at?: string
          employee_id: string
          entitled_days?: number
          id?: string
          leave_type_id: string
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          carried_over?: number
          created_at?: string
          employee_id?: string
          entitled_days?: number
          id?: string
          leave_type_id?: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          attachment_path: string | null
          attachment_url: string | null
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          attachment_url?: string | null
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          attachment_url?: string | null
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          active: boolean
          code: string
          color: string
          created_at: string
          default_annual_days: number
          id: string
          is_paid: boolean
          name_ar: string
          name_en: string
          requires_attachment: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          color?: string
          created_at?: string
          default_annual_days?: number
          id?: string
          is_paid?: boolean
          name_ar: string
          name_en: string
          requires_attachment?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          color?: string
          created_at?: string
          default_annual_days?: number
          id?: string
          is_paid?: boolean
          name_ar?: string
          name_en?: string
          requires_attachment?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          bank_code: string
          bank_name: string
          created_at: string
          employer_id: string
          establishment_name: string
          iban: string
          id: string
          updated_at: string
        }
        Insert: {
          bank_code?: string
          bank_name?: string
          created_at?: string
          employer_id?: string
          establishment_name?: string
          iban?: string
          id?: string
          updated_at?: string
        }
        Update: {
          bank_code?: string
          bank_name?: string
          created_at?: string
          employer_id?: string
          establishment_name?: string
          iban?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_disputes: {
        Row: {
          created_at: string
          employee_id: string
          hr_response: string | null
          id: string
          opened_by: string
          payroll_run_id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          hr_response?: string | null
          id?: string
          opened_by: string
          payroll_run_id: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          hr_response?: string | null
          id?: string
          opened_by?: string
          payroll_run_id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_disputes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_disputes_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_generation_locks: {
        Row: {
          locked_at: string
          locked_by: string | null
          period_month: string
        }
        Insert: {
          locked_at?: string
          locked_by?: string | null
          period_month: string
        }
        Update: {
          locked_at?: string
          locked_by?: string | null
          period_month?: string
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          absence_days: number
          absence_deduction: number
          allowances: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          base_salary: number
          bonuses_total: number
          created_at: string
          deductions_total: number
          emailed_at: string | null
          employee_decided_at: string | null
          employee_id: string
          generated_at: string
          generated_by: string | null
          id: string
          late_deduction: number
          late_minutes: number
          locked_at: string | null
          locked_by: string | null
          net_salary: number
          pay_date: string | null
          payslip_pdf_url: string | null
          period_month: string
          updated_at: string
        }
        Insert: {
          absence_days?: number
          absence_deduction?: number
          allowances?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_salary?: number
          bonuses_total?: number
          created_at?: string
          deductions_total?: number
          emailed_at?: string | null
          employee_decided_at?: string | null
          employee_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          late_deduction?: number
          late_minutes?: number
          locked_at?: string | null
          locked_by?: string | null
          net_salary?: number
          pay_date?: string | null
          payslip_pdf_url?: string | null
          period_month: string
          updated_at?: string
        }
        Update: {
          absence_days?: number
          absence_deduction?: number
          allowances?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_salary?: number
          bonuses_total?: number
          created_at?: string
          deductions_total?: number
          emailed_at?: string | null
          employee_decided_at?: string | null
          employee_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          late_deduction?: number
          late_minutes?: number
          locked_at?: string | null
          locked_by?: string | null
          net_salary?: number
          pay_date?: string | null
          payslip_pdf_url?: string | null
          period_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          auto_generate_day: number
          auto_request_approval: boolean
          created_at: string
          id: boolean
          updated_at: string
        }
        Insert: {
          auto_generate_day?: number
          auto_request_approval?: boolean
          created_at?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          auto_generate_day?: number
          auto_request_approval?: boolean
          created_at?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      permission_requests: {
        Row: {
          attachment_path: string | null
          created_at: string
          duration_minutes: number
          employee_id: string
          from_time: string
          id: string
          kind: Database["public"]["Enums"]["permission_kind"]
          reason: string
          request_date: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["permission_status"]
          to_time: string
          type: Database["public"]["Enums"]["permission_type"]
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          duration_minutes: number
          employee_id: string
          from_time: string
          id?: string
          kind?: Database["public"]["Enums"]["permission_kind"]
          reason: string
          request_date: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["permission_status"]
          to_time: string
          type: Database["public"]["Enums"]["permission_type"]
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          duration_minutes?: number
          employee_id?: string
          from_time?: string
          id?: string
          kind?: Database["public"]["Enums"]["permission_kind"]
          reason?: string
          request_date?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["permission_status"]
          to_time?: string
          type?: Database["public"]["Enums"]["permission_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_capabilities: {
        Row: {
          capability: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      shifts: {
        Row: {
          active: boolean
          break_minutes: number
          color: string
          created_at: string
          end_time: string
          id: string
          name_ar: string
          name_en: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          break_minutes?: number
          color?: string
          created_at?: string
          end_time: string
          id?: string
          name_ar: string
          name_en: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          break_minutes?: number
          color?: string
          created_at?: string
          end_time?: string
          id?: string
          name_ar?: string
          name_en?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      signatures: {
        Row: {
          contract_id: string
          id: string
          ip_address: string | null
          signature_image: string
          signed_at: string
          signer_id: string
          user_agent: string | null
          webauthn_credential_id: string | null
          webauthn_verified: boolean
        }
        Insert: {
          contract_id: string
          id?: string
          ip_address?: string | null
          signature_image: string
          signed_at?: string
          signer_id: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          webauthn_verified?: boolean
        }
        Update: {
          contract_id?: string
          id?: string
          ip_address?: string | null
          signature_image?: string
          signed_at?: string
          signer_id?: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          webauthn_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      special_work_periods: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          end_date: string
          id: string
          name_ar: string
          notes: string | null
          start_date: string
          updated_at: string
          work_end: string
          work_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          end_date: string
          id?: string
          name_ar: string
          notes?: string | null
          start_date: string
          updated_at?: string
          work_end: string
          work_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          end_date?: string
          id?: string
          name_ar?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
          work_end?: string
          work_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_work_periods_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_leave_request: {
        Args: { _id: string; _note?: string }
        Returns: Json
      }
      can_review_requests: { Args: { _user_id: string }; Returns: boolean }
      cancel_approved_leave: {
        Args: { _id: string; _note?: string }
        Returns: undefined
      }
      contract_selfsign_fields_unchanged: {
        Args: {
          _allowances: number
          _body: string
          _data: Json
          _effective_date: string
          _employee_id: string
          _id: string
          _pdf_url: string
          _salary: number
          _sent_at: string
          _template_id: string
          _title: string
        }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_employee_no: { Args: { _dept_id: string }; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_capability: {
        Args: { _capability: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manager_department_id: { Args: { _user_id: string }; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_leave_balance: {
        Args: { _employee_id: string; _leave_type_id: string; _year: number }
        Returns: undefined
      }
      try_lock_payroll_period: { Args: { _period: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "hr_admin"
        | "dept_manager"
        | "accountant"
        | "employee"
        | "owner"
        | "admin"
      attendance_status:
        | "present"
        | "late"
        | "absent"
        | "leave"
        | "early"
        | "half_day"
      contract_status: "draft" | "sent" | "signed" | "cancelled"
      document_category:
        | "national_id"
        | "passport"
        | "iqama"
        | "driver_license"
        | "qualification"
        | "certificate"
        | "cv"
        | "contract_copy"
        | "medical"
        | "insurance"
        | "training"
        | "work_permit"
        | "other"
      employee_status: "active" | "on_leave" | "terminated"
      holiday_kind: "national" | "religious" | "company" | "weekend_override"
      import_kind: "attendance" | "employees"
      import_scope: "self" | "department" | "all"
      import_status: "pending" | "approved" | "rejected" | "applied" | "partial"
      leave_request_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      notification_kind:
        | "info"
        | "success"
        | "warning"
        | "error"
        | "leave"
        | "permission"
        | "contract"
        | "payroll"
        | "attendance"
      permission_kind: "permission" | "attendance_correction"
      permission_status: "pending" | "approved" | "rejected" | "cancelled"
      permission_type:
        | "late_arrival"
        | "early_leave"
        | "personal_excuse"
        | "makeup_hours"
      verification_method: "manual" | "geo" | "webauthn"
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
      app_role: [
        "hr_admin",
        "dept_manager",
        "accountant",
        "employee",
        "owner",
        "admin",
      ],
      attendance_status: [
        "present",
        "late",
        "absent",
        "leave",
        "early",
        "half_day",
      ],
      contract_status: ["draft", "sent", "signed", "cancelled"],
      document_category: [
        "national_id",
        "passport",
        "iqama",
        "driver_license",
        "qualification",
        "certificate",
        "cv",
        "contract_copy",
        "medical",
        "insurance",
        "training",
        "work_permit",
        "other",
      ],
      employee_status: ["active", "on_leave", "terminated"],
      holiday_kind: ["national", "religious", "company", "weekend_override"],
      import_kind: ["attendance", "employees"],
      import_scope: ["self", "department", "all"],
      import_status: ["pending", "approved", "rejected", "applied", "partial"],
      leave_request_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      notification_kind: [
        "info",
        "success",
        "warning",
        "error",
        "leave",
        "permission",
        "contract",
        "payroll",
        "attendance",
      ],
      permission_kind: ["permission", "attendance_correction"],
      permission_status: ["pending", "approved", "rejected", "cancelled"],
      permission_type: [
        "late_arrival",
        "early_leave",
        "personal_excuse",
        "makeup_hours",
      ],
      verification_method: ["manual", "geo", "webauthn"],
    },
  },
} as const
