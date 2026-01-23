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
import { ArrowLeft, Plus, Loader2, Eye, Code, Settings, Trash2, Send, ChevronRight, Mail } from "lucide-react";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

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

  useEffect(() => {
    if (previewTemplate.data?.success) {
      setPreviewHtml(previewTemplate.data.html);
    }
  }, [previewTemplate.data]);

  const handleBack = () => {
    setLocation("/email-templates");
  };

  const handleCreateFunnelTemplate = (config: { delayValue: number; delayUnit: "hours" | "days" | "weeks"; sendTime?: string }) => {
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
        delayUnit: template.delayUnit as "hours" | "days" | "weeks",
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
        <TabsList className="grid w-full max-w-md grid-cols-3">
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
                              disabled={template.delayUnit === "hours"}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {template.delayValue === 0 && index === 0 ? (
                            "Enviado imediatamente quando o lead entra no funil"
                          ) : index === 0 ? (
                            `Enviar após ${template.delayValue} ${template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"} do lead entrar no funil${template.sendTime && template.delayUnit !== "hours" ? ` às ${template.sendTime} (UTC)` : ""}`
                          ) : (
                            `Enviar após ${template.delayValue} ${template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"}${template.sendTime && template.delayUnit !== "hours" ? ` às ${template.sendTime} (UTC)` : ""} do template anterior`
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
                  <p>Selecione um template e clique na seta para ver a pré-visualização</p>
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

          <div className="text-sm text-muted-foreground">Código HTML</div>

          {selectedTemplate ? (
            <Card className="border-0 shadow-none">
              <CardContent className="p-0 space-y-4">
                <div className="space-y-2">
                  <Textarea
                    id="html-editor"
                    value={selectedTemplate.htmlContent}
                    onChange={(e) => updateTemplateField(selectedTemplate.id, "htmlContent", e.target.value)}
                    className="font-mono text-sm h-[500px] bg-slate-50 dark:bg-slate-900 border rounded-lg"
                    placeholder="Cole seu código HTML aqui..."
                  />
                </div>
                <div className="flex gap-2">
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
                <p>Selecione um template na aba "Templates" para editar seu HTML</p>
              </CardContent>
            </Card>
          )}
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
