import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Loader2, Eye, Code, Settings, Trash2, Send, ChevronRight, Mail, Gauge, Users, RefreshCw } from "lucide-react";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { SimplifiedEmailEditor } from "@/components/SimplifiedEmailEditor";

interface FunnelTemplateBlock {
  id: number;
  funnelId: number;
  nome: string;
  assunto: string;
  htmlContent: string;
  posicao: number;
  delayValue: number;
  delayUnit: string;
  sendTime: string | null;
  ativo: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export default function FunnelDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const funnelId = parseInt(params.funnelId || "0");

  const [activeTab, setActiveTab] = useState("templates");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [localTemplates, setLocalTemplates] = useState<FunnelTemplateBlock[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  // Estados para diálogo de confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);
  const [deleteTemplateName, setDeleteTemplateName] = useState<string>("");

  // Estados para configuração de envio
  const [dailyLimit, setDailyLimit] = useState(50);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [rotationChunkSize, setRotationChunkSize] = useState(100);

  // Estados para enfileiramento
  const [enqueueStatus, setEnqueueStatus] = useState<"abandoned" | "active" | "all">("abandoned");
  const [enqueueBatchSize, setEnqueueBatchSize] = useState(100);
  const [isEnqueuing, setIsEnqueuing] = useState(false);

  // Query para obter funil com templates
  const { data: funnelData, refetch: refetchFunnel, isLoading } = trpc.funnels.getWithTemplates.useQuery(
    { funnelId },
    { enabled: funnelId > 0 }
  );

  // Query para obter estatísticas de emails enviados do funil
  const { data: funnelStats } = trpc.funnels.getEmailStatsByFunnelId.useQuery(
    { funnelId },
    { enabled: funnelId > 0 }
  );

  // Query para configuração de envio
  const { data: sendingConfigData, refetch: refetchSendingConfig } = trpc.sendingConfig.get.useQuery();

  // Query para contar leads elegíveis
  const { data: eligibleCount, refetch: refetchEligibleCount } = trpc.enqueue.countEligible.useQuery(
    { funnelId, leadStatus: enqueueStatus },
    { enabled: funnelId > 0 }
  );

  // Mutations
  const createFunnelTemplate = trpc.funnelTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template criado com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao criar template");
    },
  });

  const updateFunnelTemplate = trpc.funnelTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template atualizado com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao atualizar template");
    },
  });

  const toggleFunnelTemplateActive = trpc.funnelTemplates.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("Status do template atualizado!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  const deleteFunnelTemplate = trpc.funnelTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template removido com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao remover template");
    },
  });

  const updateSendingConfig = trpc.sendingConfig.update.useMutation({
    onSuccess: () => {
      toast.success("Configuração de envio atualizada!");
      refetchSendingConfig();
    },
    onError: () => {
      toast.error("Erro ao atualizar configuração");
    },
  });

  const enqueueLeads = trpc.enqueue.enqueueLeads.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      setIsEnqueuing(false);
      refetchEligibleCount();
    },
    onError: () => {
      toast.error("Erro ao enfileirar leads");
      setIsEnqueuing(false);
    },
  });

  const previewTemplate = trpc.funnelTemplates.previewWithFirstLead.useQuery(
    { templateId: selectedTemplateId! },
    { enabled: selectedTemplateId !== null && selectedTemplateId > 0 && activeTab === "preview" }
  );

  // Sincronizar templates locais com dados do servidor
  useEffect(() => {
    if (funnelData?.templates) {
      setLocalTemplates(funnelData.templates.map(t => ({
        ...t,
        delayUnit: t.delayUnit || "days",
      })));
    }
  }, [funnelData]);

  // Sincronizar config de envio
  useEffect(() => {
    if (sendingConfigData) {
      setDailyLimit(sendingConfigData.dailyLimit);
      setIntervalSeconds(sendingConfigData.intervalSeconds);
      setRotationChunkSize(sendingConfigData.rotationChunkSize || 100);
    }
  }, [sendingConfigData]);

  // Recarregar contagem quando muda o filtro
  useEffect(() => {
    refetchEligibleCount();
  }, [enqueueStatus]);

  useEffect(() => {
    if (previewTemplate.data?.success) {
      setPreviewHtml(previewTemplate.data.html);
    }
  }, [previewTemplate.data]);

  const handleBack = () => {
    setLocation("/email-templates");
  };

  const handleCreateFunnelTemplate = (config: { delayValue: number; delayUnit: "minutes" | "hours" | "days" | "weeks"; sendTime?: string }) => {
    createFunnelTemplate.mutate({
      funnelId,
      delayValue: config.delayValue,
      delayUnit: config.delayUnit,
      sendTime: config.sendTime,
    });
  };

  const updateTemplateField = (templateId: number, field: keyof FunnelTemplateBlock, value: any) => {
    setLocalTemplates(prev =>
      prev.map(template =>
        template.id === templateId ? { ...template, [field]: value } : template
      )
    );
  };

  const handleSaveTemplate = (templateId: number) => {
    const template = localTemplates.find(t => t.id === templateId);
    if (!template) return;

    updateFunnelTemplate.mutate({
      templateId,
      updates: {
        nome: template.nome,
        assunto: template.assunto,
        htmlContent: template.htmlContent,
        delayValue: template.delayValue,
        delayUnit: template.delayUnit as "minutes" | "hours" | "days" | "weeks",
        sendTime: template.sendTime || undefined,
      },
    });
  };

  const handleToggleActive = (templateId: number) => {
    toggleFunnelTemplateActive.mutate({ templateId });
  };

  const handleDeleteTemplate = (templateId: number, templateName: string) => {
    if (localTemplates.length <= 1) {
      toast.error("É necessário manter pelo menos um template no funil");
      return;
    }
    setDeleteTemplateId(templateId);
    setDeleteTemplateName(templateName);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTemplateId) {
      deleteFunnelTemplate.mutate({ templateId: deleteTemplateId });
    }
    setDeleteDialogOpen(false);
    setDeleteTemplateId(null);
    setDeleteTemplateName("");
  };

  const handlePreview = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setActiveTab("preview");
  };

  const openHtmlEditor = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setActiveTab("editor");
  };

  const handleSaveSendingConfig = () => {
    updateSendingConfig.mutate({
      dailyLimit,
      intervalSeconds,
      rotationChunkSize,
    });
  };

  const handleEnqueue = () => {
    setIsEnqueuing(true);
    enqueueLeads.mutate({
      funnelId,
      leadStatus: enqueueStatus,
      batchSize: enqueueBatchSize,
    });
  };

  const selectedTemplate = selectedTemplateId
    ? localTemplates.find(t => t.id === selectedTemplateId)
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!funnelData?.funnel) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Funil não encontrado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { funnel } = funnelData;

  const sendingProgress = sendingConfigData
    ? Math.round((sendingConfigData.emailsSentToday / sendingConfigData.dailyLimit) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Automação de Emails</h2>
        <p className="text-muted-foreground mt-1">
          Configure e gerencie os envios de emails
        </p>
      </div>

      {/* Breadcrumb do Funil - estilo do design */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3 text-sm">
          <Button variant="ghost" onClick={handleBack} size="sm" className="gap-1 px-2 h-7 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-slate-400">Funil</span>
          <span className="text-slate-300">|</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{funnel.nome}</span>
        </div>
        
        {/* Estatísticas do Funil */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400" title="Total de emails enviados">
            <Mail className="h-4 w-4" />
            <span className="font-medium">{funnelStats?.totals?.emailsSent || 0}</span>
            <span className="text-xs">enviados</span>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="templates" className="gap-2">
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
          <TabsTrigger value="sending" className="gap-2">
            <Gauge className="h-4 w-4" />
            Envio
          </TabsTrigger>
          <TabsTrigger value="enqueue" className="gap-2">
            <Users className="h-4 w-4" />
            Enfileirar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="text-sm text-muted-foreground">Templates</div>

          <div className="space-y-3">
            {localTemplates.map((template, index) => (
              <div 
                key={template.id} 
                className={`bg-white dark:bg-slate-950 rounded-xl border shadow-sm ${template.ativo === 0 ? 'opacity-60' : ''}`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    {/* Badge de tipo */}
                    <div className="px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 min-w-[90px] text-center">
                      Template
                    </div>
                    
                    {/* Nome do template */}
                    <div className="flex-1">
                      <Input
                        value={template.nome}
                        onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                        onBlur={() => handleSaveTemplate(template.id)}
                        className="text-sm font-medium border-0 p-0 h-auto focus-visible:ring-0 bg-transparent shadow-none"
                        placeholder="Nome do Template"
                      />
                    </div>
                    
                    {/* Contador de emails enviados */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Emails enviados">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{funnelStats?.templates?.find((t: any) => t.id === template.id)?.emailsSent || 0}</span>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {/* Botão de configurações */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingTemplateId(editingTemplateId === template.id ? null : template.id)}
                        className="h-8 w-8 text-slate-400 hover:text-slate-600"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      
                      {/* Toggle Off/On */}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                        <span className="text-xs text-slate-400">Off</span>
                        <Switch
                          checked={template.ativo === 1}
                          onCheckedChange={() => handleToggleActive(template.id)}
                          className="data-[state=checked]:bg-cyan-500"
                        />
                        <span className={`text-xs ${template.ativo === 1 ? 'text-cyan-500 font-medium' : 'text-slate-400'}`}>On</span>
                      </div>
                      
                      {/* Seta para detalhes */}
                      <ChevronRight 
                        className="h-5 w-5 text-slate-300 cursor-pointer hover:text-slate-500" 
                        onClick={() => handlePreview(template.id)}
                      />
                    </div>
                  </div>

                  {/* Painel de edição expandido */}
                  {editingTemplateId === template.id && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Configurações de Delay e Horário - para todos os templates */}
                      <div className="space-y-3 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                        <Label className="text-xs font-medium">
                          {index === 0 ? "Configurações de Envio Inicial" : "Configurações de Envio"}
                        </Label>
                        <div className="grid grid-cols-3 gap-3">
                          {/* Delay Value */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {index === 0 ? "Aguardar" : "Atraso"}
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              value={template.delayValue}
                              onChange={(e) => updateTemplateField(template.id, "delayValue", parseInt(e.target.value) || 0)}
                              className="text-sm h-9"
                            />
                          </div>
                          {/* Delay Unit */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Unidade</Label>
                            <Select
                              value={template.delayUnit}
                              onValueChange={(value) => updateTemplateField(template.id, "delayUnit", value)}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutes">Minutos</SelectItem>
                                <SelectItem value="hours">Horas</SelectItem>
                                <SelectItem value="days">Dias</SelectItem>
                                <SelectItem value="weeks">Semanas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Send Time */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Horário (UTC)</Label>
                            <Input
                              type="time"
                              value={template.sendTime || ""}
                              onChange={(e) => updateTemplateField(template.id, "sendTime", e.target.value || null)}
                              className="text-sm h-9"
                              disabled={template.delayUnit === "hours" || template.delayUnit === "minutes"}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {template.delayValue === 0 && index === 0 ? (
                            "Enviado imediatamente quando o lead entra no funil"
                          ) : index === 0 ? (
                            `Enviar após ${template.delayValue} ${template.delayUnit === "minutes" ? "minuto(s)" : template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"} do lead entrar no funil${template.sendTime && template.delayUnit !== "hours" && template.delayUnit !== "minutes" ? ` às ${template.sendTime} (UTC)` : ""}`
                          ) : (
                            `Enviar após ${template.delayValue} ${template.delayUnit === "minutes" ? "minuto(s)" : template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"}${template.sendTime && template.delayUnit !== "hours" && template.delayUnit !== "minutes" ? ` às ${template.sendTime} (UTC)` : ""} do template anterior`
                          )}
                        </p>
                      </div>

                      {/* Assunto */}
                      <div className="space-y-2">
                        <Label className="text-xs">Assunto</Label>
                        <Input
                          value={template.assunto}
                          onChange={(e) => updateTemplateField(template.id, "assunto", e.target.value)}
                          placeholder="Assunto do email"
                          className="text-sm"
                        />
                      </div>

                      {/* Ações */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(template.id)}
                            disabled={previewTemplate.isLoading}
                            className="text-xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Visualizar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openHtmlEditor(template.id)}
                            className="text-xs"
                          >
                            <Code className="h-3 w-3 mr-1" />
                            Editar HTML
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              handleSaveTemplate(template.id);
                              setEditingTemplateId(null);
                            }}
                            disabled={updateFunnelTemplate.isPending}
                          >
                            {updateFunnelTemplate.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                          {localTemplates.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTemplate(template.id, template.nome)}
                            >
                              <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Bloco de rotação por conta</Label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={rotationChunkSize}
                    onChange={(e) => setRotationChunkSize(parseInt(e.target.value) || 100)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantos envios seguidos por conta antes de alternar.
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Botão para adicionar novo template */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              disabled={createFunnelTemplate.isPending}
              className="border-dashed border-cyan-300 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-950"
            >
              {createFunnelTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              New
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          {/* Breadcrumb do template selecionado */}
          {selectedTemplate && (
            <div className="flex items-center gap-2 text-sm">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActiveTab("templates")}
                className="gap-1 px-2 h-7 text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-slate-400">Template</span>
              <span className="text-slate-300">|</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedTemplate.nome}</span>
            </div>
          )}

          <div className="text-sm text-muted-foreground">Pré-visualização</div>

          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              {previewTemplate.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {previewHtml && !previewTemplate.isLoading ? (
                <div className="border rounded-lg bg-gray-50 overflow-hidden">
                  <iframe
                    srcDoc={previewHtml}
                    title="Email Preview"
                    className="w-full border-0"
                    style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
                  />
                </div>
              ) : !previewTemplate.isLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione um template na aba "Templates" para pré-visualizar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editor" className="space-y-6">
          {/* Breadcrumb do template selecionado */}
          {selectedTemplate && (
            <div className="flex items-center gap-2 text-sm">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActiveTab("templates")}
                className="gap-1 px-2 h-7 text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-slate-400">Template</span>
              <span className="text-slate-300">|</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedTemplate.nome}</span>
            </div>
          )}

          <div className="text-sm text-muted-foreground">Editor de Email</div>

          {selectedTemplate ? (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0 space-y-4">
                <SimplifiedEmailEditor
                  htmlContent={selectedTemplate.htmlContent}
                  onContentChange={(content) => updateTemplateField(selectedTemplate.id, "htmlContent", content)}
                  onPreview={() => handlePreview(selectedTemplate.id)}
                  isPreviewLoading={previewTemplate.isLoading}
                />
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleSaveTemplate(selectedTemplate.id)}
                    disabled={updateFunnelTemplate.isPending}
                    className="gap-2"
                  >
                    {updateFunnelTemplate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Salvar Alterações
                  </Button>
                  <Button
                    onClick={() => setActiveTab("templates")}
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
                <p>Selecione um template na aba "Templates" para editar seu conteúdo</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== ABA DE CONFIGURAÇÃO DE ENVIO ===== */}
        <TabsContent value="sending" className="space-y-6">
          <div className="text-sm text-muted-foreground">Configurações de Envio (Rate Limiting)</div>

          {/* Status atual */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Status de Envio
              </CardTitle>
              <CardDescription>
                Controle o ritmo de envio para proteger a reputação do seu domínio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progresso do dia */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Enviados hoje</span>
                  <span className="font-medium">
                    {sendingConfigData?.emailsSentToday || 0} / {sendingConfigData?.dailyLimit || 50}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      sendingProgress >= 90 ? "bg-red-500" : sendingProgress >= 70 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(sendingProgress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {sendingConfigData?.lastSentAt
                    ? `Último envio: ${new Date(sendingConfigData.lastSentAt).toLocaleString("pt-BR")}`
                    : "Nenhum envio registrado hoje"}
                </p>
              </div>
              {/* Status operacional vinculado ao funil */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Status operacional</p>
                  <p className="text-xs text-muted-foreground">
                    O envio automatico segue o estado do funil (On/Off) na tela anterior.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full border ${funnel.ativo === 1 ? "text-cyan-600 border-cyan-200 bg-cyan-50" : "text-slate-500 border-slate-200 bg-slate-100"}`}>
                    Funil {funnel.ativo === 1 ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              {/* Configuracoes */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-sm">Limite diário</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10000"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(parseInt(e.target.value) || 50)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo de emails por dia
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Intervalo entre envios (segundos)</Label>
                  <Input
                    type="number"
                    min="5"
                    max="3600"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 30)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tempo mínimo entre cada email
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSaveSendingConfig}
                disabled={updateSendingConfig.isPending}
                className="w-full"
              >
                {updateSendingConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ABA DE ENFILEIRAMENTO ===== */}
        <TabsContent value="enqueue" className="space-y-6">
          <div className="text-sm text-muted-foreground">Enfileirar Leads Existentes</div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Adicionar Leads ao Funil
              </CardTitle>
              <CardDescription>
                Adicione leads existentes a este funil em lote. Os leads mais recentes serão processados primeiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Filtro de status */}
              <div className="space-y-2">
                <Label className="text-sm">Filtrar por status do lead</Label>
                <Select
                  value={enqueueStatus}
                  onValueChange={(value) => setEnqueueStatus(value as "abandoned" | "active" | "all")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                    <SelectItem value="active">Compra Aprovada</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contagem de elegíveis */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Leads elegíveis</p>
                    <p className="text-xs text-muted-foreground">
                      Leads que ainda não estão neste funil
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-cyan-600">
                      {eligibleCount?.count ?? "..."}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => refetchEligibleCount()}
                      className="h-8 w-8"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quantidade a enfileirar */}
              <div className="space-y-2">
                <Label className="text-sm">Quantidade a enfileirar</Label>
                <Input
                  type="number"
                  min="1"
                  max="5000"
                  value={enqueueBatchSize}
                  onChange={(e) => setEnqueueBatchSize(parseInt(e.target.value) || 100)}
                />
                <p className="text-xs text-muted-foreground">
                  Quantos leads adicionar ao funil nesta operação (máx. 5.000). Os mais recentes serão adicionados primeiro.
                </p>
              </div>

              {/* Aviso */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Atenção:</strong> Os leads serão adicionados ao funil e receberão emails conforme o limite diário configurado na aba "Envio". 
                  O envio é gradual e respeita o intervalo configurado para proteger a reputação do domínio.
                </p>
              </div>

              {/* Botão de enfileirar */}
              <Button
                onClick={handleEnqueue}
                disabled={isEnqueuing || !eligibleCount?.count || eligibleCount.count === 0}
                className="w-full gap-2"
              >
                {isEnqueuing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {isEnqueuing
                  ? "Enfileirando..."
                  : `Enfileirar ${Math.min(enqueueBatchSize, eligibleCount?.count || 0)} leads`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de criação de template */}
      <CreateItemModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateTemplate={() => {}}
        onCreateFunnel={() => {}}
        onCreateFunnelTemplate={handleCreateFunnelTemplate}
        isFunnelContext={true}
      />

      {/* Diálogo de confirmação de exclusão */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Excluir Template do Funil"
        description="Tem certeza que deseja excluir este template do funil? Esta ação não pode ser desfeita."
        itemName={deleteTemplateName}
        isLoading={deleteFunnelTemplate.isPending}
      />
    </div>
  );
}

