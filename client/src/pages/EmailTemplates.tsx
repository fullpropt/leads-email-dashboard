import React, { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Upload, Eye, Send, Loader2, Plus, Trash2, Clock, Calendar, Code, Zap, Mail, Rocket, Settings, ChevronDown } from "lucide-react";
import { TemplateTypeSelector } from "@/components/TemplateTypeSelector";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendMode: "automatic" | "scheduled" | "manual";
}

interface TemplateBlock {
  id: number;
  nome: string;
  assunto: string;
  htmlContent: string;
  ativo: number;
  // Novos campos para filtros e modo de envio
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendMode: "automatic" | "scheduled" | "manual";
  // Campos existentes para múltiplos tipos de envio
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

// Labels para exibição
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

const SEND_MODE_LABELS: Record<string, string> = {
  automatic: "Automático",
  scheduled: "Programado",
  manual: "Normal",
};

const SEND_MODE_COLORS: Record<string, string> = {
  automatic: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  scheduled: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  manual: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<TemplateBlock[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeTab, setActiveTab] = useState("templates");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const { data: allTemplates, refetch: refetchTemplates } =
    trpc.emailTemplates.list.useQuery();

  // Query para obter contagem de emails enviados por template
  const { data: emailSentCounts } = trpc.emailTemplates.getAllEmailSentCounts.useQuery();

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

  // Mutation para toggle individual do template
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

  // Mutation para envio a leads selecionados
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
    if (previewTemplate.data?.success) {
      setPreviewHtml(previewTemplate.data.html);
      setActiveTab("preview");
      toast.success("Prévia gerada com sucesso!");
    } else if (previewTemplate.isError) {
      toast.error("Erro ao gerar pré-visualização");
    }
  }, [previewTemplate.data, previewTemplate.isError]);

  const handleFileUpload = (templateId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".html")) {
      toast.error("Por favor, selecione um arquivo HTML");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      updateTemplateField(templateId, "htmlContent", content);
      toast.success("Arquivo carregado com sucesso!");
    };
    reader.readAsText(file);
  };

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

    const updates: any = {
      nome: template.nome,
      assunto: template.assunto,
      htmlContent: template.htmlContent,
      templateType: template.templateType,
      targetStatusPlataforma: template.targetStatusPlataforma,
      targetSituacao: template.targetSituacao,
      sendMode: template.sendMode,
      sendImmediateEnabled: template.sendImmediateEnabled,
      autoSendOnLeadEnabled: template.autoSendOnLeadEnabled,
      sendOnLeadDelayEnabled: template.sendOnLeadDelayEnabled,
      delayDaysAfterLeadCreation: template.delayDaysAfterLeadCreation,
      scheduleEnabled: template.scheduleEnabled,
      scheduleInterval: template.scheduleInterval,
      scheduleIntervalType: template.scheduleIntervalType,
    };

    if (template.scheduleEnabled && template.scheduleTime) {
      updates.scheduleTime = template.scheduleTime;
    }

    updateTemplate.mutate({
      templateId,
      updates,
    });
  };

  const handleAddTemplate = () => {
    setShowTypeSelector(true);
  };
  
  const handleTemplateConfigSelected = (config: TemplateConfig) => {
    // Determinar o templateType baseado na situação selecionada
    let templateType: "compra_aprovada" | "novo_cadastro" | "programado" | "carrinho_abandonado" = "compra_aprovada";
    if (config.targetSituacao === "abandoned") {
      templateType = "carrinho_abandonado";
    } else if (config.sendMode === "scheduled") {
      templateType = "programado";
    }

    createTemplate.mutate({
      nome: `Novo Template`,
      assunto: "Assunto do email",
      htmlContent: "<p>Conteúdo do email</p>",
      templateType,
      targetStatusPlataforma: config.targetStatusPlataforma,
      targetSituacao: config.targetSituacao,
      sendMode: config.sendMode,
    });
  };
  
  const getTemplateTypeName = (type: string): string => {
    const names: Record<string, string> = {
      compra_aprovada: "Compra Aprovada",
      novo_cadastro: "Novo Cadastro",
      programado: "Programado",
      carrinho_abandonado: "Carrinho Abandonado",
    };
    return names[type] || type;
  };
  
  const getTemplateTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      compra_aprovada: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
      novo_cadastro: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      programado: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
      carrinho_abandonado: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    };
    return colors[type] || "bg-gray-100 text-gray-700";
  };

  const handleRemoveTemplate = (templateId: number) => {
    if (templates.length <= 1) {
      toast.error("É necessário manter pelo menos um template");
      return;
    }

    deleteTemplate.mutate({
      templateId,
    });
  };

  // Toggle individual do template
  const handleToggleTemplateActive = (templateId: number) => {
    toggleTemplateActive.mutate({ templateId });
  };

  // Função para enviar a leads selecionados
  const handleSendToSelected = (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
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
    
    setPreviewTemplateId(templateId);
  };

  const handleSendImmediate = (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

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
    setShowHtmlEditor(true);
    setActiveTab("editor");
  };

  const closeHtmlEditor = () => {
    setShowHtmlEditor(false);
    setSelectedTemplateId(null);
  };

  const selectedTemplate = selectedTemplateId 
    ? templates.find(t => t.id === selectedTemplateId)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Automação de Emails</h2>
        <p className="text-muted-foreground mt-1">
          Configure e gerencie os templates de email com múltiplas opções de envio
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="templates" className="gap-2">
            <Calendar className="h-4 w-4" />
            Templates
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

        <TabsContent value="templates" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Templates de Email</h3>
              <p className="text-sm text-muted-foreground">Gerencie seus templates por tipo</p>
            </div>
            <Button
              onClick={handleAddTemplate}
              disabled={createTemplate.isPending}
              className="gap-2"
            >
              {createTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Novo Template
            </Button>
          </div>
          
          <TemplateTypeSelector
            isOpen={showTypeSelector}
            onSelect={handleTemplateConfigSelected}
            onClose={() => setShowTypeSelector(false)}
          />
          
          <div className="space-y-4">
            {templates.map((template) => (
              <Card key={template.id} className={`relative ${template.ativo === 0 ? 'opacity-60' : ''}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg flex-1">
                          <Input
                            placeholder="Nome do Template"
                            value={template.nome}
                            onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                            className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0"
                          />
                        </CardTitle>
                        {/* Badge de Filtros */}
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            template.targetSituacao === 'active' ? 'bg-green-100 text-green-700' :
                            template.targetSituacao === 'abandoned' ? 'bg-orange-100 text-orange-700' :
                            template.targetSituacao === 'none' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {SITUACAO_LABELS[template.targetSituacao]}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            template.targetStatusPlataforma === 'accessed' ? 'bg-green-100 text-green-700' :
                            template.targetStatusPlataforma === 'not_accessed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {STATUS_PLATAFORMA_LABELS[template.targetStatusPlataforma]}
                          </span>
                          {/* Contador de Emails Enviados */}
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {emailSentCounts?.[template.id] || 0} enviados
                          </span>
                        </div>
                      </div>
                      <CardDescription className="mt-2">
                        <Input
                          placeholder="Assunto do Email"
                          value={template.assunto}
                          onChange={(e) => updateTemplateField(template.id, "assunto", e.target.value)}
                          className="border-0 p-0 h-auto focus-visible:ring-0 text-sm"
                        />
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Modo de Envio Badge */}
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${SEND_MODE_COLORS[template.sendMode]}`}>
                        {SEND_MODE_LABELS[template.sendMode]}
                      </div>
                      
                      {/* Botão de Configurações */}
                      <Button
                        onClick={() => setEditingTemplateId(editingTemplateId === template.id ? null : template.id)}
                        size="sm"
                        variant="outline"
                        title="Editar configurações"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                        <Checkbox
                          checked={selectedTemplateId === template.id}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTemplateId(template.id);
                            } else {
                              setSelectedTemplateId(null);
                            }
                          }}
                          title="Selecionar para editar HTML"
                        />
                        <span className="text-xs text-muted-foreground">Editar HTML</span>
                      </div>
                      <Button
                        onClick={() => handleSaveTemplate(template.id)}
                        size="sm"
                        disabled={updateTemplate.isPending}
                        title="Salvar alterações"
                        className="gap-2"
                      >
                        {updateTemplate.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      {templates.length > 1 && (
                        <Button
                          onClick={() => handleRemoveTemplate(template.id)}
                          variant="destructive"
                          size="sm"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  
                  {/* Painel de Edição de Configurações */}
                  {editingTemplateId === template.id && (
                    <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 space-y-4">
                      <h4 className="font-medium text-sm">Configurações do Template</h4>
                      
                      <div className="grid grid-cols-3 gap-4">
                        {/* Status Plataforma */}
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
                        
                        {/* Situação */}
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
                        
                        {/* Modo de Envio */}
                        <div className="space-y-2">
                          <Label className="text-xs">Modo de Envio</Label>
                          <Select
                            value={template.sendMode}
                            onValueChange={(value) => updateTemplateField(template.id, "sendMode", value)}
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="automatic">Automático</SelectItem>
                              <SelectItem value="scheduled">Programado</SelectItem>
                              <SelectItem value="manual">Normal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <Button
                        onClick={() => {
                          handleSaveTemplate(template.id);
                          setEditingTemplateId(null);
                        }}
                        size="sm"
                        className="mt-2"
                      >
                        Salvar Configurações
                      </Button>
                    </div>
                  )}

                  {/* Opções de agendamento (apenas para modo programado) */}
                  {template.sendMode === "scheduled" && (
                    <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <Label className="font-medium text-purple-900 dark:text-purple-300 mb-2 block">Configurações de Agendamento</Label>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Hora do Envio</Label>
                          <Input
                            type="time"
                            value={template.scheduleTime || ""}
                            onChange={(e) => updateTemplateField(template.id, "scheduleTime", e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Intervalo</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              min="1"
                              value={template.scheduleInterval || 1}
                              onChange={(e) => updateTemplateField(template.id, "scheduleInterval", parseInt(e.target.value))}
                              className="text-sm"
                            />
                            <Select
                              value={template.scheduleIntervalType}
                              onValueChange={(value) => updateTemplateField(template.id, "scheduleIntervalType", value as "days" | "weeks")}
                            >
                              <SelectTrigger className="w-24 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="days">Dias</SelectItem>
                                <SelectItem value="weeks">Semanas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Status</Label>
                          <div className="flex items-center gap-2 pt-2">
                            <Switch
                              checked={template.scheduleEnabled === 1}
                              onCheckedChange={(checked) => 
                                updateTemplateField(template.id, "scheduleEnabled", checked ? 1 : 0)
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {template.scheduleEnabled === 1 ? "Ativado" : "Desativado"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Cabeçalho com botões de envio */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-600" />
                      <Label className="font-medium">Enviar Email</Label>
                      {template.sendMode === "automatic" && (
                        <span className="text-xs text-muted-foreground">(Automático ao criar novo lead)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Toggle INDIVIDUAL para ativar/desativar este template */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg border">
                        <Zap className="h-4 w-4 text-yellow-600" />
                        <Switch
                          checked={template.ativo === 1}
                          onCheckedChange={() => handleToggleTemplateActive(template.id)}
                          disabled={toggleTemplateActive.isPending}
                          title="Ativar/desativar este template"
                        />
                        <span className="text-xs text-muted-foreground ml-1">
                          {template.ativo === 1 ? "Ativado" : "Desativado"}
                        </span>
                      </div>
                      
                      {/* Botões de envio manual (apenas para modo normal/manual) */}
                      {template.sendMode === "manual" && (
                        <>
                          <Button
                            onClick={() => handleSendToSelected(template.id)}
                            disabled={sendToSelectedLeads.isPending || template.ativo === 0}
                            size="sm"
                            variant="secondary"
                            className="gap-2"
                            title="Enviar para leads selecionados"
                          >
                            {sendToSelectedLeads.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4" />
                                Enviar Selecionados
                              </>
                            )}
                          </Button>

                          <Button
                            onClick={() => handleSendImmediate(template.id)}
                            disabled={sendImmediateEmail.isPending || template.ativo === 0}
                            size="sm"
                            className="gap-2 bg-blue-600 hover:bg-blue-700"
                            title="Enviar para todos os leads pendentes"
                          >
                            {sendImmediateEmail.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4" />
                                Enviar Todos
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Seção de Conteúdo HTML */}
                  <div className="border rounded-lg p-4">
                    <div className="mb-4">
                      <Label className="font-medium">Conteúdo do Email</Label>
                    </div>

                    {template.htmlContent ? (
                      <div className="space-y-3">
                        <div className="bg-muted p-3 rounded text-xs text-muted-foreground">
                          HTML carregado ({template.htmlContent.length} caracteres)
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openHtmlEditor(template.id)}
                            className="gap-1"
                          >
                            <Code className="h-3 w-3" />
                            Editar Código
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreview(template.id)}
                            disabled={previewTemplate.isLoading}
                            className="gap-1"
                          >
                            {previewTemplate.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                            Visualizar Email
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum HTML carregado. Faça upload de um arquivo ou clique em "Editar Código".
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button onClick={handleAddTemplate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização do Email</CardTitle>
              <CardDescription>
                Visualize como o email será exibido no primeiro lead
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewTemplate.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {previewHtml && !previewTemplate.isLoading ? (
                <div className="border rounded-lg bg-gray-50 overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
                  <iframe
                    srcDoc={previewHtml}
                    title="Email Preview"
                    className="w-full border-0"
                    style={{ minHeight: "800px" }}
                  />
                </div>
              ) : !previewTemplate.isLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione um template e clique em "Visualizar Email" para ver a pré-visualização</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editor" className="space-y-6">
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <CardTitle>Editor HTML - {selectedTemplate.nome}</CardTitle>
                <CardDescription>
                  Edite o código HTML do seu template
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="html-editor">Código HTML</Label>
                  <Textarea
                    id="html-editor"
                    value={selectedTemplate.htmlContent}
                    onChange={(e) => updateTemplateField(selectedTemplate.id, "htmlContent", e.target.value)}
                    className="font-mono text-sm h-96"
                    placeholder="Cole seu código HTML aqui..."
                  />
                </div>
                <div className="flex gap-2">
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
                    onClick={closeHtmlEditor}
                    variant="outline"
                  >
                    Fechar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione um template na aba "Templates" para editar seu HTML</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
