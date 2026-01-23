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
import { Eye, Send, Loader2, Plus, Trash2, Code, Settings, ChevronRight, Mail } from "lucide-react";
import { CreateItemModal } from "@/components/CreateItemModal";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface FunnelConfig {
  nome: string;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
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

export default function EmailTemplates() {
  const [, setLocation] = useLocation();
  const [templates, setTemplates] = useState<TemplateBlock[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeTab, setActiveTab] = useState("items");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  // Queries
  const { data: allTemplates, refetch: refetchTemplates } = trpc.emailTemplates.list.useQuery();
  const { data: allFunnels, refetch: refetchFunnels } = trpc.funnels.list.useQuery();
  const { data: emailSentCounts } = trpc.emailTemplates.getAllEmailSentCounts.useQuery();

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

  const handleRemoveTemplate = (templateId: number) => {
    deleteTemplate.mutate({ templateId });
  };

  const handleToggleTemplateActive = (templateId: number) => {
    toggleTemplateActive.mutate({ templateId });
  };

  const handleToggleFunnelActive = (funnelId: number) => {
    toggleFunnelActive.mutate({ funnelId });
  };

  const handleRemoveFunnel = (funnelId: number) => {
    deleteFunnel.mutate({ funnelId });
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
    setPreviewTemplateId(templateId);
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
                className={`bg-white dark:bg-slate-950 rounded-xl border shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${template.ativo === 0 ? 'opacity-60' : ''}`}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  handlePreview(template.id);
                }}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    {/* Badge de tipo */}
                    <div className="px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 min-w-[90px] text-center">
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
                            onClick={() => handleRemoveTemplate(template.id)}
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

            {/* Renderizar Funis */}
            {funnels.map((funnel: FunnelBlock) => (
              <div 
                key={`funnel-${funnel.id}`} 
                className={`bg-white dark:bg-slate-950 rounded-xl border shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${funnel.ativo === 0 ? 'opacity-60' : ''}`}
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
                    
                    {/* Ações */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Botão de configurações/deletar */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFunnel(funnel.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-500"
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
                </div>
              </div>
            ))}
          </div>

          {/* Botão para adicionar novo item */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              disabled={createTemplate.isPending || createFunnel.isPending}
              className="border-dashed border-cyan-300 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-950"
            >
              {(createTemplate.isPending || createFunnel.isPending) ? (
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
                <p>Selecione um template na aba "Itens" para editar seu HTML</p>
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
      />
    </div>
  );
}
