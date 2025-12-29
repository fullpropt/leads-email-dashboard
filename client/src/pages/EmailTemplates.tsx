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
import { Upload, Eye, Send, Loader2, Plus, Trash2, Clock, Calendar, Code, Zap, Mail, Rocket } from "lucide-react";

interface TemplateBlock {
  id: number;
  nome: string;
  assunto: string;
  htmlContent: string;
  ativo: number;
  // Novos campos para múltiplos tipos de envio
  sendImmediateEnabled: number;
  autoSendOnLeadEnabled: number;
  scheduleEnabled: number;
  scheduleTime: string;
  scheduleInterval: number;
  scheduleIntervalType: "days" | "weeks";
  criadoEm: Date;
  atualizadoEm: Date;
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<TemplateBlock[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeTab, setActiveTab] = useState("templates");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);

  const { data: allTemplates, refetch: refetchTemplates } =
    trpc.emailTemplates.list.useQuery();

  // Query para obter status do auto-envio
  const { data: autoSendStatus, refetch: refetchAutoSendStatus } =
    trpc.autoSend.getStatus.useQuery();

  // Mutation para toggle do auto-envio
  const toggleAutoSend = trpc.autoSend.toggle.useMutation({
    onSuccess: (data) => {
      if (data) {
        toast.success("Status do auto-envio atualizado!");
        refetchAutoSendStatus();
      } else {
        toast.error("Erro ao atualizar status do auto-envio");
      }
    },
    onError: () => {
      toast.error("Erro ao atualizar status do auto-envio");
    },
  });

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

  // ✨ NOVO: Mutation para envio a leads selecionados
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

  // ✅ CORREÇÃO: Usar useQuery APENAS quando previewTemplateId é válido
  // Isso evita o problema do templateId: 0
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
      })));
    }
  }, [allTemplates]);

  // Sincronizar status do auto-envio
  React.useEffect(() => {
    if (autoSendStatus !== undefined) {
      setAutoSendEnabled(autoSendStatus);
    }
  }, [autoSendStatus]);

  // Função para toggle do auto-envio
  const handleToggleAutoSend = () => {
    toggleAutoSend.mutate(!autoSendEnabled);
  };

  // ✅ NOVO: Observar mudanças na query de preview
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
      sendImmediateEnabled: template.sendImmediateEnabled,
      autoSendOnLeadEnabled: template.autoSendOnLeadEnabled,
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
    createTemplate.mutate({
      nome: "Novo Template",
      assunto: "Assunto do email",
      htmlContent: "<p>Conteúdo do email</p>",
    });
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

  // ✨ NOVO: Função para enviar a leads selecionados
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

  // ✅ CORREÇÃO: Simples e direto - apenas atualiza o estado
  const handlePreview = (templateId: number) => {
    if (!templateId) {
      toast.error("Template não encontrado");
      return;
    }
    
    console.log("[DEBUG Frontend] Ativando preview para templateId:", templateId);
    setPreviewTemplateId(templateId);
    // A query será ativada automaticamente pelo useEffect acima
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
          <div className="space-y-4">
            {templates.map((template) => (
              <Card key={template.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        <Input
                          placeholder="Nome do Template"
                          value={template.nome}
                          onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                          className="text-lg font-semibold border-0 p-0 h-auto focus-visible:ring-0"
                        />
                      </CardTitle>
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
                        <span className="text-xs text-muted-foreground">Selecionar</span>
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
                  

                  {/* ====== SEÇÃO DE ENVIO E AGENDAMENTO (OTIMIZADA) ====== */}
                  <div className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                    {/* Cabeçalho com botões de envio */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <Label className="font-medium">Enviar Email</Label>
                        <span className="text-xs text-muted-foreground">(Automático ao criar novo lead)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Toggle para ativar/desativar auto-envio */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg border">
                          <Zap className="h-4 w-4 text-yellow-600" />
                          <Switch
                            checked={autoSendEnabled}
                            onCheckedChange={handleToggleAutoSend}
                            disabled={toggleAutoSend.isPending}
                            title="Ativar/desativar envio automático para novos leads"
                          />
                          <span className="text-xs text-muted-foreground ml-1">
                            {autoSendEnabled ? "Ativado" : "Desativado"}
                          </span>
                        </div>
                        {/* ✨ NOVO: Botão para enviar a leads selecionados */}
                        <Button
                          onClick={() => handleSendToSelected(template.id)}
                          disabled={sendToSelectedLeads.isPending}
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

                        {/* Botão de envio imediato (todos os pendentes) */}
                        <Button
                          onClick={() => handleSendImmediate(template.id)}
                          disabled={sendImmediateEmail.isPending}
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
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg border">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Switch
                            checked={template.scheduleEnabled === 1}
                            onCheckedChange={(checked) => 
                              updateTemplateField(template.id, "scheduleEnabled", checked ? 1 : 0)
                            }
                            title="Ativar agendamento periódico"
                          />
                          <span className="text-xs text-muted-foreground ml-1">Agendamento</span>
                        </div>
                      </div>
                    </div>

                    {/* Opções de agendamento (expandem quando ativado) */}
                    {template.scheduleEnabled === 1 && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <p className="text-sm text-muted-foreground mb-3">Configure o envio periódico:</p>
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
                            <Label className="text-xs">Próximo envio</Label>
                            <div className="text-sm text-muted-foreground pt-2">
                              {template.scheduleTime ? `${template.scheduleTime}` : "Defina a hora"}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ====== SEÇÃO DE CONTEÚDO HTML ====== */}
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
                <div className="border rounded-lg p-4 bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    title="Email Preview"
                    className="w-full h-96 border rounded"
                    sandbox={{ allow: ["same-origin"] }}
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
