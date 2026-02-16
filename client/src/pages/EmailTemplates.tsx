import React, { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Eye,
  Send,
  Loader2,
  Plus,
  Trash2,
  Code,
  Settings,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { SimplifiedEmailEditor } from "@/components/SimplifiedEmailEditor";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface FunnelConfig {
  nome: string;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface TransmissionConfig {
  name: string;
  mode: "immediate" | "scheduled";
  scheduledAt?: string;
  sendIntervalSeconds: number;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendOrder: "newest_first" | "oldest_first";
}

interface TemplateBlock {
  id: number;
  nome: string;
  assunto: string;
  htmlContent: string;
  ativo: number;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendMode: "automatic" | "scheduled" | "manual";
  sendImmediateEnabled: number;
  autoSendOnLeadEnabled: number;
  sendOnLeadDelayEnabled: number;
  delayDaysAfterLeadCreation: number;
  scheduleEnabled: number;
  scheduleTime: string | null;
  scheduleInterval: number;
  scheduleIntervalType: "days" | "weeks";
  templateType: "compra_aprovada" | "novo_cadastro" | "programado" | "carrinho_abandonado";
  criadoEm: Date;
  atualizadoEm: Date;
}

interface FunnelBlock {
  id: number;
  nome: string;
  descricao: string | null;
  targetStatusPlataforma: string;
  targetSituacao: string;
  ativo: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

interface TransmissionBlock {
  id: number;
  name: string;
  subject: string;
  htmlContent: string;
  mode: "immediate" | "scheduled";
  scheduledAt: string | null;
  sendIntervalSeconds: number;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendOrder: "newest_first" | "oldest_first";
  enabled: number;
  status: "draft" | "scheduled" | "processing" | "completed" | "paused" | "failed";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  lastSentAt: string | null;
  nextRunAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

// Labels para exibição dos filtros
const STATUS_PLATAFORMA_LABELS: Record<string, string> = {
  all: "Todos",
  accessed: "Ativo",
  not_accessed: "Inativo",
};

const SITUACAO_LABELS: Record<string, string> = {
  all: "Todos",
  active: "Compra Aprovada",
  abandoned: "Carrinho Abandonado",
  none: "Nenhum",
};

// Labels curtos para badges
const STATUS_PLATAFORMA_SHORT: Record<string, string> = {
  all: "Todos",
  accessed: "Ativo",
  not_accessed: "Inativo",
};

const SITUACAO_SHORT: Record<string, string> = {
  all: "Todos",
  active: "Aprovada",
  abandoned: "Abandonado",
  none: "Nenhum",
};

const TRANSMISSION_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  processing: "Processando",
  completed: "Concluida",
  paused: "Pausada",
  failed: "Falhou",
};

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function EmailTemplates() {
  const [, setLocation] = useLocation();
  const [templates, setTemplates] = useState<TemplateBlock[]>([]);
  const [transmissions, setTransmissions] = useState<TransmissionBlock[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMode, setPreviewMode] = useState<"template" | "transmission" | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewInfo, setPreviewInfo] = useState("");
  const [activeTab, setActiveTab] = useState("items");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [previewTransmissionId, setPreviewTransmissionId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editingTransmissionId, setEditingTransmissionId] = useState<number | null>(null);
  const [editingFunnelId, setEditingFunnelId] = useState<number | null>(null);
  const [expandedTransmissionHtml, setExpandedTransmissionHtml] = useState<
    Record<number, boolean>
  >({});

  // Estados para diálogo de confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"template" | "funnel" | "transmission" | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteItemName, setDeleteItemName] = useState<string>("");

  // Queries
  const { data: allTemplates, refetch: refetchTemplates } = trpc.emailTemplates.list.useQuery();
  const { data: allFunnels, refetch: refetchFunnels } = trpc.funnels.list.useQuery();
  const { data: allTransmissions, refetch: refetchTransmissions } = trpc.transmissions.list.useQuery();
  const { data: emailSentCounts } = trpc.emailTemplates.getAllEmailSentCounts.useQuery();
  const { data: funnelEmailStats } = trpc.funnels.getEmailStats.useQuery();

  // Mutations para Templates
  const createTemplate = trpc.emailTemplates.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Template criado com sucesso!");
        refetchTemplates();
      } else {
        toast.error("Erro ao criar template");
      }
    },
    onError: () => {
      toast.error("Erro ao criar template");
    },
  });

  const updateTemplate = trpc.emailTemplates.update.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Template atualizado com sucesso!");
        refetchTemplates();
      } else {
        toast.error("Erro ao atualizar template");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar template");
    },
  });

  const deleteTemplate = trpc.emailTemplates.delete.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Template removido com sucesso!");
        refetchTemplates();
      } else {
        toast.error("Erro ao remover template");
      }
    },
    onError: () => {
      toast.error("Erro ao remover template");
    },
  });

  const toggleTemplateActive = trpc.emailTemplates.toggleActive.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Status do template atualizado!");
        refetchTemplates();
      } else {
        toast.error("Erro ao atualizar status do template");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar status do template");
    },
  });

  // Mutations para Funis
  const createFunnel = trpc.funnels.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Funil criado com sucesso!");
        refetchFunnels();
      } else {
        toast.error("Erro ao criar funil");
      }
    },
    onError: () => {
      toast.error("Erro ao criar funil");
    },
  });

  const toggleFunnelActive = trpc.funnels.toggleActive.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Status do funil atualizado!");
        refetchFunnels();
      } else {
        toast.error("Erro ao atualizar status do funil");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar status do funil");
    },
  });

  const deleteFunnel = trpc.funnels.delete.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Funil removido com sucesso!");
        refetchFunnels();
      } else {
        toast.error("Erro ao remover funil");
      }
    },
    onError: () => {
      toast.error("Erro ao remover funil");
    },
  });

  const updateFunnel = trpc.funnels.update.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Funil atualizado com sucesso!");
        refetchFunnels();
      } else {
        toast.error("Erro ao atualizar funil");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar funil");
    },
  });

  // Mutations para Transmissoes
  const createTransmission = trpc.transmissions.create.useMutation({
    onSuccess: data => {
      if (data.success) {
        toast.success("Transmissao criada com sucesso!");
        refetchTransmissions();
      } else {
        toast.error(data.message || "Erro ao criar transmissao");
      }
    },
    onError: () => {
      toast.error("Erro ao criar transmissao");
    },
  });

  const updateTransmission = trpc.transmissions.update.useMutation({
    onSuccess: data => {
      if (data.success) {
        toast.success("Transmissao atualizada!");
        refetchTransmissions();
      } else {
        toast.error(data.message || "Erro ao atualizar transmissao");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar transmissao");
    },
  });

  const deleteTransmission = trpc.transmissions.delete.useMutation({
    onSuccess: data => {
      if (data.success) {
        toast.success("Transmissao removida com sucesso!");
        refetchTransmissions();
      } else {
        toast.error(data.message || "Erro ao remover transmissao");
      }
    },
    onError: () => {
      toast.error("Erro ao remover transmissao");
    },
  });

  const launchTransmission = trpc.transmissions.launch.useMutation({
    onSuccess: data => {
      if (data.success) {
        toast.success(data.message || "Transmissao enviada/agendada com sucesso");
        refetchTransmissions();
      } else {
        toast.error(data.message || "Erro ao iniciar transmissao");
      }
    },
    onError: () => {
      toast.error("Erro ao iniciar transmissao");
    },
  });

  const setTransmissionEnabled = trpc.transmissions.setEnabled.useMutation({
    onSuccess: data => {
      if (data.success) {
        refetchTransmissions();
      } else {
        toast.error(data.message || "Erro ao atualizar status da transmissao");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar status da transmissao");
    },
  });

  // Mutations para envio de email
  const sendImmediateEmail = trpc.email.sendImmediateToAllPending.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`${data.sent} emails enviados com sucesso!`);
        refetchTemplates();
      } else {
        toast.error(data.message || "Erro ao enviar emails");
      }
    },
    onError: () => {
      toast.error("Erro ao enviar emails");
    },
  });

  const sendToSelectedLeads = trpc.email.sendToSelectedLeads.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`${data.sent} emails enviados com sucesso!`);
        refetchTemplates();
      } else {
        toast.error(data.message || "Erro ao enviar emails");
      }
    },
    onError: () => {
      toast.error("Erro ao enviar emails");
    },
  });

  const previewTemplate = trpc.emailTemplates.previewWithFirstLead.useQuery(
    { templateId: previewTemplateId! },
    {
      enabled: previewTemplateId !== null && previewTemplateId > 0,
      retry: false,
    }
  );

  const previewTransmission = trpc.transmissions.previewWithFirstLead.useQuery(
    { id: previewTransmissionId! },
    {
      enabled: previewTransmissionId !== null && previewTransmissionId > 0,
      retry: false,
    }
  );

  React.useEffect(() => {
    if (allTemplates) {
      setTemplates(allTemplates.map(t => ({
        ...t,
        scheduleIntervalType: t.scheduleIntervalType as "days" | "weeks",
        targetStatusPlataforma: (t.targetStatusPlataforma || "all") as "all" | "accessed" | "not_accessed",
        targetSituacao: (t.targetSituacao || "all") as "all" | "active" | "abandoned" | "none",
        sendMode: (t.sendMode || "manual") as "automatic" | "scheduled" | "manual",
        templateType: t.templateType as "compra_aprovada" | "novo_cadastro" | "programado" | "carrinho_abandonado",
      })));
    }
  }, [allTemplates]);

  React.useEffect(() => {
    if (allTransmissions) {
      setTransmissions(allTransmissions as TransmissionBlock[]);
    }
  }, [allTransmissions]);

  React.useEffect(() => {
    if (previewTemplate.data?.success) {
      setPreviewHtml(previewTemplate.data.html);
      setPreviewMode("template");
      setPreviewSubject("");
      setPreviewInfo("");
      setActiveTab("preview");
      toast.success("Prévia gerada com sucesso!");
    } else if (previewTemplate.isError) {
      toast.error("Erro ao gerar pré-visualização");
    }
  }, [previewTemplate.data, previewTemplate.isError]);

  React.useEffect(() => {
    if (previewTransmission.data?.success) {
      setPreviewHtml(previewTransmission.data.html);
      setPreviewMode("transmission");
      setPreviewSubject(previewTransmission.data.subject || "");
      if (previewTransmission.data.leadEmail) {
        setPreviewInfo(`Lead usado no preview: ${previewTransmission.data.leadEmail}`);
      } else {
        setPreviewInfo(
          previewTransmission.data.message ||
            "Sem lead elegível. Preview gerado com dados de exemplo."
        );
      }
      setActiveTab("preview");
      toast.success("Prévia da transmissão gerada com sucesso!");
    } else if (previewTransmission.isError) {
      toast.error("Erro ao gerar prévia da transmissão");
    }
  }, [previewTransmission.data, previewTransmission.isError]);

  const updateTemplateField = (templateId: number, field: keyof TemplateBlock, value: any) => {
    setTemplates(prev =>
      prev.map(template =>
        template.id === templateId ? { ...template, [field]: value } : template
      )
    );
  };

  const handleSaveTemplate = (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (!template || !template.nome || !template.assunto || !template.htmlContent) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    updateTemplate.mutate({
      templateId,
      updates: {
        nome: template.nome,
        assunto: template.assunto,
        htmlContent: template.htmlContent,
        templateType: template.templateType,
        targetStatusPlataforma: template.targetStatusPlataforma,
        targetSituacao: template.targetSituacao,
        sendMode: template.sendMode,
      },
    });
  };

  const handleCreateTemplate = (config: TemplateConfig) => {
    createTemplate.mutate({
      nome: "Novo Template",
      assunto: "Assunto do email",
      htmlContent: "<p>Conteúdo do email</p>",
      templateType: config.targetSituacao === "abandoned" ? "carrinho_abandonado" : "compra_aprovada",
      targetStatusPlataforma: config.targetStatusPlataforma,
      targetSituacao: config.targetSituacao,
      sendMode: "manual",
    });
  };

  const handleCreateFunnel = (config: FunnelConfig) => {
    createFunnel.mutate({
      nome: config.nome,
      targetStatusPlataforma: config.targetStatusPlataforma,
      targetSituacao: config.targetSituacao,
    });
  };

  const handleCreateTransmission = (config: TransmissionConfig) => {
    createTransmission.mutate({
      name: config.name,
      subject: "Assunto da transmissao",
      htmlContent: "<p>Conteudo da transmissao</p>",
      mode: config.mode,
      scheduledAt:
        config.mode === "scheduled" && config.scheduledAt
          ? new Date(config.scheduledAt).toISOString()
          : null,
      sendIntervalSeconds: config.sendIntervalSeconds,
      targetStatusPlataforma: config.targetStatusPlataforma,
      targetSituacao: config.targetSituacao,
      sendOrder: config.sendOrder,
    });
  };

  const updateTransmissionField = (
    transmissionId: number,
    field: keyof TransmissionBlock,
    value: any
  ) => {
    setTransmissions(prev =>
      prev.map(transmission =>
        transmission.id === transmissionId
          ? { ...transmission, [field]: value }
          : transmission
      )
    );
  };

  const handleSaveTransmission = (transmissionId: number) => {
    const transmission = transmissions.find(item => item.id === transmissionId);
    if (!transmission) return;
    if (!transmission.name || !transmission.subject || !transmission.htmlContent) {
      toast.error("Preencha nome, assunto e conteudo da transmissao");
      return;
    }

    updateTransmission.mutate({
      id: transmissionId,
      updates: {
        name: transmission.name,
        subject: transmission.subject,
        htmlContent: transmission.htmlContent,
        mode: transmission.mode,
        scheduledAt: transmission.scheduledAt,
        sendIntervalSeconds: transmission.sendIntervalSeconds,
        targetStatusPlataforma: transmission.targetStatusPlataforma,
        targetSituacao: transmission.targetSituacao,
        sendOrder: transmission.sendOrder,
      },
    });
  };

  const handleLaunchTransmission = (transmissionId: number) => {
    launchTransmission.mutate({ id: transmissionId });
  };

  const handleToggleTransmissionEnabled = (
    transmissionId: number,
    enabled: boolean
  ) => {
    setTransmissionEnabled.mutate({ id: transmissionId, enabled });
  };

  const handleRemoveTransmission = (
    transmissionId: number,
    transmissionName: string
  ) => {
    setDeleteType("transmission");
    setDeleteItemId(transmissionId);
    setDeleteItemName(transmissionName);
    setDeleteDialogOpen(true);
  };

  const handleRemoveTemplate = (templateId: number, templateName: string) => {
    setDeleteType("template");
    setDeleteItemId(templateId);
    setDeleteItemName(templateName);
    setDeleteDialogOpen(true);
  };

  const handleToggleTemplateActive = (templateId: number) => {
    toggleTemplateActive.mutate({ templateId });
  };

  const handleToggleFunnelActive = (funnelId: number) => {
    toggleFunnelActive.mutate({ funnelId });
  };

  const handleRemoveFunnel = (funnelId: number, funnelName: string) => {
    setDeleteType("funnel");
    setDeleteItemId(funnelId);
    setDeleteItemName(funnelName);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteType === "template" && deleteItemId) {
      deleteTemplate.mutate({ templateId: deleteItemId });
    } else if (deleteType === "funnel" && deleteItemId) {
      deleteFunnel.mutate({ funnelId: deleteItemId });
    } else if (deleteType === "transmission" && deleteItemId) {
      deleteTransmission.mutate({ id: deleteItemId });
    }
    setDeleteDialogOpen(false);
    setDeleteType(null);
    setDeleteItemId(null);
    setDeleteItemName("");
  };

  const handleSaveFunnel = (funnelId: number, updates: { nome?: string; targetStatusPlataforma?: string; targetSituacao?: string }) => {
    updateFunnel.mutate({ funnelId, updates });
  };

  const handleFunnelClick = (funnelId: number) => {
    setLocation(`/email-templates/funil/${funnelId}`);
  };

  const handleSendToSelected = (templateId: number) => {
    toast.promise(
      new Promise((resolve) => {
        sendToSelectedLeads.mutate(
          { templateId },
          {
            onSuccess: (data) => resolve(data),
            onError: (error) => resolve(error),
          }
        );
      }),
      {
        loading: "Enviando emails para leads selecionados...",
        success: "Emails enviados com sucesso!",
        error: "Erro ao enviar emails",
      }
    );
  };

  const handlePreview = (templateId: number) => {
    if (!templateId) {
      toast.error("Template não encontrado");
      return;
    }
    setPreviewMode("template");
    setPreviewTransmissionId(null);
    setPreviewSubject("");
    setPreviewInfo("");
    setPreviewTemplateId(templateId);
  };

  const handlePreviewTransmission = (transmissionId: number) => {
    if (!transmissionId) {
      toast.error("Transmissão não encontrada");
      return;
    }
    setPreviewMode("transmission");
    setPreviewTemplateId(null);
    setPreviewTransmissionId(transmissionId);
  };

  const handleSendImmediate = (templateId: number) => {
    toast.promise(
      new Promise((resolve) => {
        sendImmediateEmail.mutate(
          { templateId },
          {
            onSuccess: (data) => resolve(data),
            onError: (error) => resolve(error),
          }
        );
      }),
      {
        loading: "Enviando emails...",
        success: "Emails enviados com sucesso!",
        error: "Erro ao enviar emails",
      }
    );
  };

  const openHtmlEditor = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setActiveTab("editor");
  };

  const selectedTemplate = selectedTemplateId
    ? templates.find(t => t.id === selectedTemplateId)
    : null;

  // Combinar templates e funis para exibição
  const funnels = allFunnels || [];
  const isPreviewLoading = previewTemplate.isLoading || previewTransmission.isLoading;
  const previewDescription =
    previewMode === "transmission"
      ? "Visualize como a transmissão será exibida para o primeiro lead elegível."
      : "Visualize como o email será exibido no primeiro lead";
  const previewEmptyMessage =
    previewMode === "transmission"
      ? 'Selecione uma transmissão e clique em "Visualizar" para ver a prévia.'
      : 'Selecione um template e clique em "Visualizar Email" para ver a pré-visualização.';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Automação de Emails</h2>
        <p className="text-muted-foreground mt-1">
          Configure e gerencie os envios de emails
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="items" className="gap-2">
            Itens
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Pré-visualização
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-2">
            <Code className="h-4 w-4" />
            Editor HTML
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="text-sm text-muted-foreground">Itens</div>

          <div className="space-y-3">
            {/* Renderizar Templates */}
            {templates.map((template) => (
              <div 
                key={`template-${template.id}`} 
                className={`bg-white dark:bg-slate-950 rounded-xl border border-sky-100 dark:border-sky-900 border-l-4 border-l-sky-300 dark:border-l-sky-700 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${template.ativo === 0 ? 'opacity-60' : ''}`}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  handlePreview(template.id);
                }}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    {/* Badge de tipo */}
                    <div className="px-4 py-1.5 rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 text-sm font-medium text-sky-600 dark:text-sky-400 min-w-[90px] text-center">
                      Template
                    </div>
                    
                    {/* Nome do template */}
                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={template.nome}
                        onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                        onBlur={() => handleSaveTemplate(template.id)}
                        className="text-sm font-medium border-0 p-0 h-auto focus-visible:ring-0 bg-transparent shadow-none"
                        placeholder="Nome do Template"
                      />
                    </div>
                    
                    {/* Filtros como badges */}
                    <div className="flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400">
                      <span>{SITUACAO_SHORT[template.targetSituacao]}</span>
                      <span className="text-slate-400">.</span>
                      <span>{STATUS_PLATAFORMA_SHORT[template.targetStatusPlataforma]}</span>
                    </div>
                    
                    {/* Contador de emails enviados */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Emails enviados">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{emailSentCounts?.[template.id] || 0}</span>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Botão de configurações */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingTemplateId(editingTemplateId === template.id ? null : template.id)}
                        className="h-8 w-8 text-slate-400 hover:text-slate-600"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      
                      {/* Botão Enviar */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendImmediate(template.id)}
                        disabled={sendImmediateEmail.isPending || template.ativo === 0}
                        className="gap-1.5 text-cyan-600 border-cyan-200 hover:bg-cyan-50 dark:text-cyan-400 dark:border-cyan-800 dark:hover:bg-cyan-950"
                      >
                        {sendImmediateEmail.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Enviar</span>
                            <Send className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                      
                      {/* Botão S (enviar para selecionados) */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendToSelected(template.id)}
                        disabled={sendToSelectedLeads.isPending || template.ativo === 0}
                        className="px-2 text-slate-400 border-slate-200 hover:text-slate-600 dark:border-slate-700"
                        title="Enviar para leads selecionados"
                      >
                        S
                      </Button>
                      
                      {/* Seta para detalhes */}
                      <ChevronRight 
                        className="h-5 w-5 text-slate-300" 
                      />
                    </div>
                  </div>

                  {/* Painel de edição expandido */}
                  {editingTemplateId === template.id && (
                    <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Status Plataforma</Label>
                          <Select
                            value={template.targetStatusPlataforma}
                            onValueChange={(value) => updateTemplateField(template.id, "targetStatusPlataforma", value)}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="accessed">Ativo</SelectItem>
                              <SelectItem value="not_accessed">Inativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Situação</Label>
                          <Select
                            value={template.targetSituacao}
                            onValueChange={(value) => updateTemplateField(template.id, "targetSituacao", value)}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="active">Compra Aprovada</SelectItem>
                              <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Assunto</Label>
                        <Input
                          value={template.assunto}
                          onChange={(e) => updateTemplateField(template.id, "assunto", e.target.value)}
                          placeholder="Assunto do email"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openHtmlEditor(template.id)}
                          >
                            <Code className="h-4 w-4 mr-1" />
                            Editar HTML
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(template.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Visualizar
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              handleSaveTemplate(template.id);
                              setEditingTemplateId(null);
                            }}
                            disabled={updateTemplate.isPending}
                          >
                            {updateTemplate.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveTemplate(template.id, template.nome)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Renderizar Transmissoes */}
            {transmissions.map((transmission) => (
              <div
                key={`transmission-${transmission.id}`}
                className={`bg-white dark:bg-slate-950 rounded-xl border border-amber-100 dark:border-amber-900 border-l-4 border-l-amber-400 dark:border-l-amber-700 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${transmission.enabled === 0 ? "opacity-60" : ""}`}
                onClick={() =>
                  setEditingTransmissionId(
                    editingTransmissionId === transmission.id ? null : transmission.id
                  )
                }
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    <div className="px-4 py-1.5 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-sm font-medium text-amber-600 dark:text-amber-300 min-w-[110px] text-center">
                      Transmissao
                    </div>

                    <div className="flex-1">
                      <span className="text-sm font-medium">{transmission.name}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                      <span>{SITUACAO_SHORT[transmission.targetSituacao] || transmission.targetSituacao}</span>
                      <span className="text-slate-400">.</span>
                      <span>{STATUS_PLATAFORMA_SHORT[transmission.targetStatusPlataforma] || transmission.targetStatusPlataforma}</span>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {transmission.sentCount}/{transmission.totalRecipients}
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 min-w-[86px] text-right">
                      {TRANSMISSION_STATUS_LABELS[transmission.status] || transmission.status}
                    </div>

                    <div
                      className="flex items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEditingTransmissionId(
                            editingTransmissionId === transmission.id ? null : transmission.id
                          )
                        }
                        className="h-8 w-8 text-slate-400 hover:text-slate-600"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreviewTransmission(transmission.id)}
                        disabled={previewTransmission.isLoading}
                        className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-200 dark:border-amber-700 dark:hover:bg-amber-950"
                      >
                        {previewTransmission.isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Visualizar</span>
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLaunchTransmission(transmission.id)}
                        disabled={launchTransmission.isPending || transmission.enabled === 0}
                        className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-200 dark:border-amber-700 dark:hover:bg-amber-950"
                      >
                        {launchTransmission.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : transmission.mode === "scheduled" ? (
                          "Agendar"
                        ) : (
                          "Enviar"
                        )}
                      </Button>

                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                        <span className="text-xs text-slate-400">Off</span>
                        <Switch
                          checked={transmission.enabled === 1}
                          onCheckedChange={checked =>
                            handleToggleTransmissionEnabled(transmission.id, checked)
                          }
                          className="data-[state=checked]:bg-amber-500"
                        />
                        <span className={`text-xs ${transmission.enabled === 1 ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                          On
                        </span>
                      </div>
                    </div>
                  </div>

                  {editingTransmissionId === transmission.id && (
                    <div className="mt-4 pt-4 border-t space-y-4" onClick={event => event.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Nome</Label>
                          <Input
                            value={transmission.name}
                            onChange={event =>
                              updateTransmissionField(transmission.id, "name", event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Assunto</Label>
                          <Input
                            value={transmission.subject}
                            onChange={event =>
                              updateTransmissionField(
                                transmission.id,
                                "subject",
                                event.target.value
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Modo</Label>
                          <Select
                            value={transmission.mode}
                            onValueChange={value =>
                              updateTransmissionField(
                                transmission.id,
                                "mode",
                                value as "immediate" | "scheduled"
                              )
                            }
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate">Imediato</SelectItem>
                              <SelectItem value="scheduled">Agendado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Intervalo (segundos)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="3600"
                            value={transmission.sendIntervalSeconds}
                            onChange={event =>
                              updateTransmissionField(
                                transmission.id,
                                "sendIntervalSeconds",
                                Math.max(0, parseInt(event.target.value) || 0)
                              )
                            }
                          />
                        </div>
                      </div>

                      {transmission.mode === "scheduled" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Agendar para</Label>
                          <Input
                            type="datetime-local"
                            value={toDateTimeLocal(transmission.scheduledAt)}
                            onChange={event =>
                              updateTransmissionField(
                                transmission.id,
                                "scheduledAt",
                                event.target.value
                                  ? new Date(event.target.value).toISOString()
                                  : null
                              )
                            }
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Status Plataforma</Label>
                          <Select
                            value={transmission.targetStatusPlataforma}
                            onValueChange={value =>
                              updateTransmissionField(
                                transmission.id,
                                "targetStatusPlataforma",
                                value as "all" | "accessed" | "not_accessed"
                              )
                            }
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="accessed">Ativo</SelectItem>
                              <SelectItem value="not_accessed">Inativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Situacao</Label>
                          <Select
                            value={transmission.targetSituacao}
                            onValueChange={value =>
                              updateTransmissionField(
                                transmission.id,
                                "targetSituacao",
                                value as "all" | "active" | "abandoned" | "none"
                              )
                            }
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="active">Compra Aprovada</SelectItem>
                              <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                              <SelectItem value="none">Nenhum</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Ordem de envio</Label>
                          <Select
                            value={transmission.sendOrder}
                            onValueChange={value =>
                              updateTransmissionField(
                                transmission.id,
                                "sendOrder",
                                value as "newest_first" | "oldest_first"
                              )
                            }
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="newest_first">Mais novos primeiro</SelectItem>
                              <SelectItem value="oldest_first">Mais antigos primeiro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Conteudo HTML</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              setExpandedTransmissionHtml(prev => ({
                                ...prev,
                                [transmission.id]: !prev[transmission.id],
                              }))
                            }
                          >
                            {expandedTransmissionHtml[transmission.id] ? (
                              <>
                                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                                Recolher
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                Expandir
                              </>
                            )}
                          </Button>
                        </div>
                        {expandedTransmissionHtml[transmission.id] ? (
                          <Textarea
                            value={transmission.htmlContent}
                            onChange={event =>
                              updateTransmissionField(
                                transmission.id,
                                "htmlContent",
                                event.target.value
                              )
                            }
                            className="min-h-[220px] font-mono text-xs"
                          />
                        ) : (
                          <div className="rounded-md border bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-muted-foreground">
                            Campo recolhido para economizar espaco na tela.
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Falhas: {transmission.failedCount} | Pendentes: {transmission.pendingCount}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveTransmission(transmission.id, transmission.name)
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-500 mr-1" />
                            Remover
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveTransmission(transmission.id)}
                            disabled={updateTransmission.isPending}
                          >
                            {updateTransmission.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Renderizar Funis */}
            {funnels.map((funnel: FunnelBlock) => (
              <div 
                key={`funnel-${funnel.id}`} 
                className={`bg-white dark:bg-slate-950 rounded-xl border border-cyan-100 dark:border-cyan-900 border-l-4 border-l-cyan-400 dark:border-l-cyan-700 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${funnel.ativo === 0 ? 'opacity-60' : ''}`}
                onClick={() => handleFunnelClick(funnel.id)}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    {/* Badge de tipo - Funil com cor diferente */}
                    <div 
                      className="px-4 py-1.5 rounded-full border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950 text-sm font-medium text-cyan-600 dark:text-cyan-400 min-w-[90px] text-center"
                    >
                      Funil
                    </div>
                    
                    {/* Nome do funil */}
                    <div className="flex-1">
                      <span className="text-sm font-medium">{funnel.nome}</span>
                    </div>
                    
                    {/* Filtros como badges */}
                    <div className="flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400">
                      <span>{SITUACAO_SHORT[funnel.targetSituacao] || funnel.targetSituacao}</span>
                      <span className="text-slate-400">.</span>
                      <span>{STATUS_PLATAFORMA_SHORT[funnel.targetStatusPlataforma] || funnel.targetStatusPlataforma}</span>
                    </div>
                    
                    {/* Contador de emails enviados */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Emails enviados">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{funnelEmailStats?.find((f: any) => f.id === funnel.id)?.emailsSent || 0}</span>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Botão de configurações */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingFunnelId(editingFunnelId === funnel.id ? null : funnel.id)}
                        className="h-8 w-8 text-slate-400 hover:text-slate-600"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      
                      {/* Toggle Off/On */}
                      <div 
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700"
                      >
                        <span className="text-xs text-slate-400">Off</span>
                        <Switch
                          checked={funnel.ativo === 1}
                          onCheckedChange={() => handleToggleFunnelActive(funnel.id)}
                          className="data-[state=checked]:bg-cyan-500"
                        />
                        <span className={`text-xs ${funnel.ativo === 1 ? 'text-cyan-500 font-medium' : 'text-slate-400'}`}>On</span>
                      </div>
                      
                      {/* Seta para detalhes */}
                      <ChevronRight 
                        className="h-5 w-5 text-slate-300" 
                      />
                    </div>
                  </div>

                  {/* Painel de edição expandido do funil */}
                  {editingFunnelId === funnel.id && (
                    <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <Label className="text-xs">Nome do Funil</Label>
                        <Input
                          defaultValue={funnel.nome}
                          placeholder="Nome do funil"
                          onBlur={(e) => {
                            if (e.target.value !== funnel.nome) {
                              handleSaveFunnel(funnel.id, { nome: e.target.value });
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Status Plataforma</Label>
                          <Select
                            defaultValue={funnel.targetStatusPlataforma}
                            onValueChange={(value) => handleSaveFunnel(funnel.id, { targetStatusPlataforma: value })}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="accessed">Ativo</SelectItem>
                              <SelectItem value="not_accessed">Inativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Situação</Label>
                          <Select
                            defaultValue={funnel.targetSituacao}
                            onValueChange={(value) => handleSaveFunnel(funnel.id, { targetSituacao: value })}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              <SelectItem value="active">Compra Aprovada</SelectItem>
                              <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFunnel(funnel.id, funnel.nome)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500 mr-1" />
                          Remover Funil
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setEditingFunnelId(null)}
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Botão para adicionar novo item */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              disabled={
                createTemplate.isPending ||
                createFunnel.isPending ||
                createTransmission.isPending
              }
              className="border-dashed border-cyan-300 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-950"
            >
              {(createTemplate.isPending || createFunnel.isPending || createTransmission.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              New
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização do Email</CardTitle>
              <CardDescription>{previewDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {isPreviewLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {previewHtml && !isPreviewLoading ? (
                <div className="space-y-3">
                  {previewMode === "transmission" && (
                    <div className="rounded-md border bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2 text-xs">
                      {previewSubject && (
                        <p className="text-amber-800 dark:text-amber-200">
                          <strong>Assunto:</strong> {previewSubject}
                        </p>
                      )}
                      {previewInfo && (
                        <p className="text-amber-700 dark:text-amber-300">{previewInfo}</p>
                      )}
                    </div>
                  )}
                  <div className="border rounded-lg bg-gray-50 overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      title="Email Preview"
                      className="w-full border-0"
                      style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
                    />
                  </div>
                </div>
              ) : !isPreviewLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{previewEmptyMessage}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editor" className="space-y-6">
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <CardTitle>Editor de Email - {selectedTemplate.nome}</CardTitle>
                <CardDescription>
                  Crie seu email usando texto simples ou HTML. O sistema aplica automaticamente estilos, header, footer e link de unsubscribe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SimplifiedEmailEditor
                  htmlContent={selectedTemplate.htmlContent}
                  onContentChange={(content) => updateTemplateField(selectedTemplate.id, "htmlContent", content)}
                  onPreview={() => handlePreview(selectedTemplate.id)}
                  isPreviewLoading={previewTemplate.isLoading}
                />
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleSaveTemplate(selectedTemplate.id)}
                    disabled={updateTemplate.isPending}
                    className="gap-2"
                  >
                    {updateTemplate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Salvar Alterações
                  </Button>
                  <Button
                    onClick={() => setActiveTab("items")}
                    variant="outline"
                  >
                    Voltar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione um template na aba "Itens" para editar seu conteúdo</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de criação */}
      <CreateItemModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateTemplate={handleCreateTemplate}
        onCreateFunnel={handleCreateFunnel}
        onCreateTransmission={handleCreateTransmission}
      />

      {/* Diálogo de confirmação de exclusão */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title={
          deleteType === "template"
            ? "Excluir Template"
            : deleteType === "funnel"
              ? "Excluir Funil"
              : "Excluir Transmissao"
        }
        description={
          deleteType === "template"
            ? "Tem certeza que deseja excluir este template? Esta acao nao pode ser desfeita e todo o historico de envios relacionado sera mantido."
            : deleteType === "funnel"
              ? "Tem certeza que deseja excluir este funil? Esta acao nao pode ser desfeita e todos os templates dentro do funil serao removidos."
              : "Tem certeza que deseja excluir esta transmissao? Esta acao nao pode ser desfeita."
        }
        itemName={deleteItemName}
        isLoading={
          deleteTemplate.isPending ||
          deleteFunnel.isPending ||
          deleteTransmission.isPending
        }
      />
    </div>
  );
}
