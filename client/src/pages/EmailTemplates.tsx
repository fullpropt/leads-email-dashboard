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

// Cores minimalistas em tons de cinza
const SEND_MODE_COLORS: Record<string, string> = {
  automatic: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  scheduled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  manual: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
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
  
  // Cores minimalistas para tipos de template
  const getTemplateTypeColor = (type: string): string => {
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
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
            <p className="text-sm text-slate-500">Gerencie seus templates</p>
            <Button
              onClick={handleAddTemplate}
              disabled={createTemplate.isPending}
              variant="outline"
              size="sm"
              className="text-slate-600"
            >
              {createTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Novo
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
                        {/* Badges minimalistas */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                            {SITUACAO_LABELS[template.targetSituacao]}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                            {STATUS_PLATAFORMA_LABELS[template.targetStatusPlataforma]}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-400">
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
                    {/* Botões minimalistas */}
                    <div className="flex items-center gap-1.5">
                      {/* Modo de Envio Badge */}
                      <span className="px-2 py-0.5 rounded text-xs text-slate-500 bg-slate-100 dark:bg-slate-800">
                        {SEND_MODE_LABELS[template.sendMode]}
                      </span>
                      
                      {/* Botões de ação */}
                      <Button
                        onClick={() => setEditingTemplateId(editingTemplateId === template.id ? null : template.id)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Configurações"
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                      </Button>
                      
                      <Button
                        onClick={() => handleSaveTemplate(template.id)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={updateTemplate.isPending}
                        title="Salvar"
                      >
                        {updateTemplate.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                      
                      {templates.length > 1 && (
                        <Button
                          onClick={() => handleRemoveTemplate(template.id)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
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
                  
                  {/* Seção de envio minimalista */}
                  <div className="flex items-center justify-between py-3 border-b">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {template.sendMode === "automatic" ? "Envio automático" : "Envio manual"}
                      </span>
                      <Switch
                        checked={template.ativo === 1}
                        onCheckedChange={() => handleToggleTemplateActive(template.id)}
                        disabled={toggleTemplateActive.isPending}
                      />
                      <span className="text-xs text-slate-400">
                        {template.ativo === 1 ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    
                    {/* Botões de envio (apenas para modo manual) */}
                    {template.sendMode === "manual" && (
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleSendToSelected(template.id)}
                          disabled={sendToSelectedLeads.isPending || template.ativo === 0}
                          size="sm"
                          variant="ghost"
                          className="text-slate-600 hover:text-slate-900"
                        >
                          {sendToSelectedLeads.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Enviar Selecionados"
                          )}
                        </Button>

                        <Button
                          onClick={() => handleSendImmediate(template.id)}
                          disabled={sendImmediateEmail.isPending || template.ativo === 0}
                          size="sm"
                          variant="default"
                          className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900"
                        >
                          {sendImmediateEmail.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Enviar Todos"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Seção de Conteúdo HTML - Minimalista */}
                  <div className="pt-3">
                    {template.htmlContent ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                          {template.htmlContent.length} caracteres
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openHtmlEditor(template.id)}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            <Code className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePreview(template.id)}
                            disabled={previewTemplate.isLoading}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            {previewTemplate.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Eye className="h-3 w-3 mr-1" />
                                Visualizar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Nenhum HTML carregado
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button 
            onClick={handleAddTemplate} 
            variant="outline"
            className="text-slate-600 border-dashed"
          >
            <Plus className="h-4 w-4 mr-1" />
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
