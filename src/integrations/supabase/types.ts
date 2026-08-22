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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      support_inboxes: {
        Row: {
          id: string
          nome: string
          slug: string
          email: string | null
          dominio_entrada: string | null
          descricao: string | null
          padrao: boolean
          ativa: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          slug: string
          email?: string | null
          dominio_entrada?: string | null
          descricao?: string | null
          padrao?: boolean
          ativa?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          slug?: string
          email?: string | null
          dominio_entrada?: string | null
          descricao?: string | null
          padrao?: boolean
          ativa?: boolean
          created_at?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          id: string
          nome: string
          fuso: string
          dias_uteis: number[]
          hora_inicio: string
          hora_fim: string
          conta_so_em_horario_comercial: boolean
          padrao: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          fuso?: string
          dias_uteis?: number[]
          hora_inicio?: string
          hora_fim?: string
          conta_so_em_horario_comercial?: boolean
          padrao?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          fuso?: string
          dias_uteis?: number[]
          hora_inicio?: string
          hora_fim?: string
          conta_so_em_horario_comercial?: boolean
          padrao?: boolean
          created_at?: string
        }
        Relationships: []
      }
      sla_targets: {
        Row: {
          id: string
          policy_id: string
          prioridade: "critica" | "alta" | "media" | "baixa"
          primeira_resposta_min: number
          resolucao_min: number
        }
        Insert: {
          id?: string
          policy_id: string
          prioridade: "critica" | "alta" | "media" | "baixa"
          primeira_resposta_min: number
          resolucao_min: number
        }
        Update: {
          id?: string
          policy_id?: string
          prioridade?: "critica" | "alta" | "media" | "baixa"
          primeira_resposta_min?: number
          resolucao_min?: number
        }
        Relationships: []
      }
      client_support: {
        Row: {
          client_id: string
          habilitado: boolean
          inbox_id: string | null
          sla_policy_id: string | null
          observacoes: string | null
          habilitado_por: string | null
          habilitado_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          habilitado?: boolean
          inbox_id?: string | null
          sla_policy_id?: string | null
          observacoes?: string | null
          habilitado_por?: string | null
          habilitado_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          habilitado?: boolean
          inbox_id?: string | null
          sla_policy_id?: string | null
          observacoes?: string | null
          habilitado_por?: string | null
          habilitado_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_categorias: {
        Row: {
          id: string
          nome: string
          slug: string
          descricao: string | null
          ordem: number
          ativa: boolean
        }
        Insert: {
          id?: string
          nome: string
          slug: string
          descricao?: string | null
          ordem?: number
          ativa?: boolean
        }
        Update: {
          id?: string
          nome?: string
          slug?: string
          descricao?: string | null
          ordem?: number
          ativa?: boolean
        }
        Relationships: []
      }
      tickets: {
        Row: {
          id: string
          numero: number
          client_id: string
          inbox_id: string | null
          categoria_id: string | null
          assunto: string
          descricao: string | null
          prioridade: "critica" | "alta" | "media" | "baixa"
          status: "novo" | "em_atendimento" | "aguardando_cliente" | "em_espera" | "resolvido" | "fechado"
          canal: "portal" | "email" | "interno"
          solicitante_user_id: string | null
          solicitante_nome: string | null
          solicitante_email: string
          responsavel_id: string | null
          assumido_em: string | null
          aberto_em: string
          prazo_primeira_resposta: string | null
          prazo_resolucao: string | null
          primeira_resposta_em: string | null
          resolvido_em: string | null
          fechado_em: string | null
          pausado_desde: string | null
          minutos_pausados: number
          reaberturas: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          numero?: number
          client_id: string
          inbox_id?: string | null
          categoria_id?: string | null
          assunto: string
          descricao?: string | null
          prioridade?: "critica" | "alta" | "media" | "baixa"
          status?: "novo" | "em_atendimento" | "aguardando_cliente" | "em_espera" | "resolvido" | "fechado"
          canal?: "portal" | "email" | "interno"
          solicitante_user_id?: string | null
          solicitante_nome?: string | null
          solicitante_email: string
          responsavel_id?: string | null
          assumido_em?: string | null
          aberto_em?: string
          prazo_primeira_resposta?: string | null
          prazo_resolucao?: string | null
          primeira_resposta_em?: string | null
          resolvido_em?: string | null
          fechado_em?: string | null
          pausado_desde?: string | null
          minutos_pausados?: number
          reaberturas?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          numero?: number
          client_id?: string
          inbox_id?: string | null
          categoria_id?: string | null
          assunto?: string
          descricao?: string | null
          prioridade?: "critica" | "alta" | "media" | "baixa"
          status?: "novo" | "em_atendimento" | "aguardando_cliente" | "em_espera" | "resolvido" | "fechado"
          canal?: "portal" | "email" | "interno"
          solicitante_user_id?: string | null
          solicitante_nome?: string | null
          solicitante_email?: string
          responsavel_id?: string | null
          assumido_em?: string | null
          aberto_em?: string
          prazo_primeira_resposta?: string | null
          prazo_resolucao?: string | null
          primeira_resposta_em?: string | null
          resolvido_em?: string | null
          fechado_em?: string | null
          pausado_desde?: string | null
          minutos_pausados?: number
          reaberturas?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          id: string
          ticket_id: string
          tipo: "publica" | "nota_interna" | "sistema"
          canal: "portal" | "email" | "interno"
          corpo: string
          autor_id: string | null
          autor_nome: string | null
          autor_email: string | null
          email_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          tipo?: "publica" | "nota_interna" | "sistema"
          canal?: "portal" | "email" | "interno"
          corpo: string
          autor_id?: string | null
          autor_nome?: string | null
          autor_email?: string | null
          email_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          tipo?: "publica" | "nota_interna" | "sistema"
          canal?: "portal" | "email" | "interno"
          corpo?: string
          autor_id?: string | null
          autor_nome?: string | null
          autor_email?: string | null
          email_message_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_watchers: {
        Row: {
          id: string
          ticket_id: string
          email: string
          nome: string | null
          adicionado_por: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          email: string
          nome?: string | null
          adicionado_por?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          email?: string
          nome?: string | null
          adicionado_por?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_email_outbox: {
        Row: {
          id: string
          ticket_id: string
          message_id: string | null
          destinatarios: string[]
          assunto: string
          corpo: string
          enviado_em: string | null
          erro: string | null
          tentativas: number
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          message_id?: string | null
          destinatarios: string[]
          assunto: string
          corpo: string
          enviado_em?: string | null
          erro?: string | null
          tentativas?: number
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          message_id?: string | null
          destinatarios?: string[]
          assunto?: string
          corpo?: string
          enviado_em?: string | null
          erro?: string | null
          tentativas?: number
          created_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          assunto: string
          client_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          descricao: string | null
          id: string
          ocorrido_em: string
          tipo: string
          visivel_cliente: boolean
        }
        Insert: {
          assunto: string
          client_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          id?: string
          ocorrido_em?: string
          tipo?: string
          visivel_cliente?: boolean
        }
        Update: {
          assunto?: string
          client_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          descricao?: string | null
          id?: string
          ocorrido_em?: string
          tipo?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ativo: string | null
          cidade: string | null
          classificacao: string | null
          cnpj: string | null
          codigo_t: string | null
          created_at: string
          email_contrato: string | null
          email_financeiro: string | null
          id: string
          is_carteira: boolean
          macro_segmento: string | null
          nome: string
          observacoes: string | null
          owner_id: string | null
          pais: string | null
          razao_social: string | null
          segmento: string | null
          tickets_abertos: number | null
          tickets_fluig: number | null
          tipo: string | null
          uf: string | null
          ultimo_ticket: string | null
          updated_at: string
        }
        Insert: {
          ativo?: string | null
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          codigo_t?: string | null
          created_at?: string
          email_contrato?: string | null
          email_financeiro?: string | null
          id?: string
          is_carteira?: boolean
          macro_segmento?: string | null
          nome: string
          observacoes?: string | null
          owner_id?: string | null
          pais?: string | null
          razao_social?: string | null
          segmento?: string | null
          tickets_abertos?: number | null
          tickets_fluig?: number | null
          tipo?: string | null
          uf?: string | null
          ultimo_ticket?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: string | null
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          codigo_t?: string | null
          created_at?: string
          email_contrato?: string | null
          email_financeiro?: string | null
          id?: string
          is_carteira?: boolean
          macro_segmento?: string | null
          nome?: string
          observacoes?: string | null
          owner_id?: string | null
          pais?: string | null
          razao_social?: string | null
          segmento?: string | null
          tickets_abertos?: number | null
          tickets_fluig?: number | null
          tipo?: string | null
          uf?: string | null
          ultimo_ticket?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          cargo: string | null
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_decisor: boolean
          nome: string
          observacoes: string | null
          papel: string | null
          telefone: string | null
          tickets: number | null
          ultima_interacao: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_decisor?: boolean
          nome: string
          observacoes?: string | null
          papel?: string | null
          telefone?: string | null
          tickets?: number | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_decisor?: boolean
          nome?: string
          observacoes?: string | null
          papel?: string | null
          telefone?: string | null
          tickets?: number | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          escopo: string | null
          horas_contratadas: number | null
          id: string
          numero: string | null
          status: string
          titulo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          escopo?: string | null
          horas_contratadas?: number | null
          id?: string
          numero?: string | null
          status?: string
          titulo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          escopo?: string | null
          horas_contratadas?: number | null
          id?: string
          numero?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          client_id: string
          created_at: string
          descricao: string | null
          id: string
          owner_id: string | null
          posicao: number
          previsao_fechamento: string | null
          probabilidade: number | null
          stage: Database["public"]["Enums"]["deal_stage"]
          titulo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          owner_id?: string | null
          posicao?: number
          previsao_fechamento?: string | null
          probabilidade?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          titulo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          owner_id?: string | null
          posicao?: number
          previsao_fechamento?: string | null
          probabilidade?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          titulo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string
          id: string
          meeting_id: string
          nome: string | null
          notificado_em: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email: string
          id?: string
          meeting_id: string
          nome?: string | null
          notificado_em?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string
          id?: string
          meeting_id?: string
          nome?: string | null
          notificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ata: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          fim: string
          id: string
          inicio: string
          link: string | null
          local: string | null
          pauta: string | null
          solicitada_pelo_cliente: boolean
          status: Database["public"]["Enums"]["meeting_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          ata?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          fim: string
          id?: string
          inicio: string
          link?: string | null
          local?: string | null
          pauta?: string | null
          solicitada_pelo_cliente?: boolean
          status?: Database["public"]["Enums"]["meeting_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          ata?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          fim?: string
          id?: string
          inicio?: string
          link?: string | null
          local?: string | null
          pauta?: string | null
          solicitada_pelo_cliente?: boolean
          status?: Database["public"]["Enums"]["meeting_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cargo: string | null
          client_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          created_at: string
          descricao: string | null
          horas_estimadas: number | null
          id: string
          posicao: number
          prazo: string | null
          prioridade: string
          project_id: string
          responsavel_id: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          horas_estimadas?: number | null
          id?: string
          posicao?: number
          prazo?: string | null
          prioridade?: string
          project_id: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          created_at?: string
          descricao?: string | null
          horas_estimadas?: number | null
          id?: string
          posicao?: number
          prazo?: string | null
          prioridade?: string
          project_id?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          titulo?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          contract_id: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_participants: {
        Row: {
          convidado_por: string | null
          created_at: string
          email: string
          id: string
          task_id: string
        }
        Insert: {
          convidado_por?: string | null
          created_at?: string
          email: string
          id?: string
          task_id: string
        }
        Update: {
          convidado_por?: string | null
          created_at?: string
          email?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_participants_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          author_nome: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_nome?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_nome?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
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
      emails_pendentes: {
        Args: { _ticket?: string | null; _limite?: number }
        Returns: {
          id: string
          ticket_numero: number
          assunto: string
          corpo: string
          destinatarios: string[]
          responder_para: string
          autor_nome: string | null
          cliente: string | null
        }[]
      }
      marcar_email: { Args: { _id: string; _erro?: string | null }; Returns: undefined }
      agentes_de_suporte: {
        Args: never
        Returns: {
          id: string
          nome: string | null
          email: string | null
          papel: Database["public"]["Enums"]["app_role"]
        }[]
      }
      is_suporte: { Args: never; Returns: boolean }
      is_analista: { Args: never; Returns: boolean }
      registrar_resposta_de_webhook: {
        Args: {
          _segredo: string
          _numero: number
          _token: string
          _de_email: string
          _de_nome: string | null
          _corpo: string
          _message_id: string | null
        }
        Returns: { mensagem_id: string | null; ticket_id: string; situacao: string }[]
      }
      emails_pendentes_de_webhook: {
        Args: { _segredo: string; _ticket: string }
        Returns: {
          id: string
          ticket_numero: number
          assunto: string
          corpo: string
          destinatarios: string[]
          responder_para: string
          autor_nome: string | null
          cliente: string | null
        }[]
      }
      marcar_email_de_webhook: {
        Args: { _segredo: string; _id: string; _erro?: string | null }
        Returns: undefined
      }
      endereco_resposta: { Args: { _ticket: string }; Returns: string }
      acompanho_ticket: { Args: { _ticket: string }; Returns: boolean }
      meu_suporte_habilitado: { Args: never; Returns: boolean }
      meu_email: { Args: never; Returns: string }
      sou_participante: { Args: { _task: string }; Returns: boolean }
      client_of_project: { Args: { _project_id: string }; Returns: string }
      client_of_task: { Args: { _task_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      my_client_id: { Args: never; Returns: string }
      task_visivel_cliente: { Args: { _task_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "interno" | "analista" | "cliente"
      deal_stage:
        | "novo"
        | "contatado"
        | "reuniao_agendada"
        | "proposta"
        | "negociacao"
        | "ganho"
        | "perdido"
      meeting_status: "solicitada" | "agendada" | "realizada" | "cancelada"
      task_status: "backlog" | "todo" | "doing" | "review" | "done"
      ticket_status: "novo" | "em_atendimento" | "aguardando_cliente" | "em_espera" | "resolvido" | "fechado"
      ticket_prioridade: "critica" | "alta" | "media" | "baixa"
      ticket_canal: "portal" | "email" | "interno"
      mensagem_tipo: "publica" | "nota_interna" | "sistema"
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
      app_role: ["admin", "interno", "analista", "cliente"],
      deal_stage: [
        "novo",
        "contatado",
        "reuniao_agendada",
        "proposta",
        "negociacao",
        "ganho",
        "perdido",
      ],
      meeting_status: ["solicitada", "agendada", "realizada", "cancelada"],
      task_status: ["backlog", "todo", "doing", "review", "done"],
    },
  },
} as const
