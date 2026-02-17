import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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

const LIVE_PREVIEW_SAMPLE_VALUES: Record<string, string> = {
  "{{nome}}": "Lead Exemplo",
  "{{email}}": "lead@example.com",
  "{{produto}}": "Produto Exemplo",
  "{{plano}}": "Plano Premium",
  "{{valor}}": "R$ 199,00",
};

function replaceLivePreviewVariables(content: string) {
  let output = content;
  for (const [token, value] of Object.entries(LIVE_PREVIEW_SAMPLE_VALUES)) {
    output = output.split(token).join(value);
  }
  return output;
}

function buildRealtimePreviewDoc(content: string) {
  const withSampleValues = replaceLivePreviewVariables(content || "");
  const trimmed = withSampleValues.trim();

  if (!trimmed) {
    return `
      <html>
        <body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#475569;background:#f8fafc;">
          Sem conteudo para visualizar.
        </body>
      </html>
    `;
  }

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  if (looksLikeHtml) {
    return trimmed;
  }

  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(
      paragraph =>
        `<p style="margin:0 0 12px 0;line-height:1.65;">${paragraph.replace(/\n/g, "<br/>")}</p>`
    )
    .join("");

  return `
    <html>
      <body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#0f172a;background:#ffffff;">
        ${paragraphs}
      </body>
    </html>
  `;
}

export default function FunnelDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const funnelId = parseInt(params.funnelId || "0");

  const [activeTab, setActiveTab] = useState("templates");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
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
      toast.success("Transmissão criada com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao criar transmissão");
    },
  });

  const updateFunnelTemplate = trpc.funnelTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Transmissão atualizada com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao atualizar transmissão");
    },
  });

  const toggleFunnelTemplateActive = trpc.funnelTemplates.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("Status da transmissão atualizado!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  const deleteFunnelTemplate = trpc.funnelTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Transmissão removida com sucesso!");
      refetchFunnel();
    },
    onError: () => {
      toast.error("Erro ao remover transmissão");
    },
  });

  // Sincronizar templates locais com dados do servidor
  useEffect(() => {
    if (funnelData?.templates) {
      setLocalTemplates(funnelData.templates.map(t => ({
        ...t,
        delayUnit: t.delayUnit || "days",
      })));
    }
  }, [funnelData]);

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
      toast.error("É necessário manter pelo menos uma transmissão no funil");
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
    setActiveTab("editor");
  };

  const openHtmlEditor = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setActiveTab("editor");
  };

  const handleBackToTransmissions = () => {
    setActiveTab("templates");
    setSelectedTemplateId(null);
  };

  const selectedTemplate = selectedTemplateId
    ? localTemplates.find(t => t.id === selectedTemplateId)
    : null;
  const realtimePreviewDoc = buildRealtimePreviewDoc(selectedTemplate?.htmlContent || "");

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
        <TabsContent value="templates" className="space-y-4">
          <div className="text-sm text-muted-foreground">Transmissões</div>
          <div className="space-y-3">
            {localTemplates.map((template, index) => (
              <div
                key={template.id}
                className={`bg-white dark:bg-slate-950 rounded-xl border shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${template.ativo === 0 ? 'opacity-60' : ''}`}
                onClick={() => openHtmlEditor(template.id)}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    {/* Badge de tipo */}
                    <div className="px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 min-w-[90px] text-center">
                      Transmissão
                    </div>

                    {/* Nome do template */}
                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={template.nome}
                        onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                        onBlur={() => handleSaveTemplate(template.id)}
                        className="text-sm font-medium border-0 p-0 h-auto focus-visible:ring-0 bg-transparent shadow-none"
                        placeholder="Nome da Transmissão"
                      />
                    </div>

                    {/* Contador de emails enviados */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Emails enviados">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{funnelStats?.templates?.find((t: any) => t.id === template.id)?.emailsSent || 0}</span>
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
                    <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                      {/* Configurações de Delay e Horário - para todos os templates */}
                      <div className="space-y-3 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                        <Label className="text-xs font-medium">
                          {index === 0
                            ? "Quando enviar a primeira transmissão"
                            : "Quando enviar esta transmissão"}
                        </Label>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {index === 0
                                ? "Aguardar após entrada no funil"
                                : "Aguardar após transmissão anterior"}
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              value={template.delayValue}
                              onChange={(e) => updateTemplateField(template.id, "delayValue", parseInt(e.target.value) || 0)}
                              className="text-sm h-9"
                            />
                          </div>
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
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {template.delayValue === 0 ? (
                            index === 0
                              ? "Esta transmissão será enviada imediatamente quando o lead entrar no funil."
                              : "Esta transmissão será enviada imediatamente após a transmissão anterior."
                          ) : index === 0 ? (
                            `Esta transmissão será enviada ${template.delayValue} ${template.delayUnit === "minutes" ? "minuto(s)" : template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"} após a entrada do lead no funil.`
                          ) : (
                            `Esta transmissão será enviada ${template.delayValue} ${template.delayUnit === "minutes" ? "minuto(s)" : template.delayUnit === "hours" ? "hora(s)" : template.delayUnit === "days" ? "dia(s)" : "semana(s)"} após a transmissão anterior.`
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
                            className="text-xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Editar + Preview
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

        <TabsContent value="editor" className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToTransmissions}
              className="gap-1 px-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Transmissoes
            </Button>
            {selectedTemplate ? (
              <>
                <span className="text-slate-300">|</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {selectedTemplate.nome}
                </span>
              </>
            ) : null}
          </div>

          {selectedTemplate ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="pt-5 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Assunto</Label>
                    <Input
                      value={selectedTemplate.assunto}
                      onChange={event =>
                        updateTemplateField(selectedTemplate.id, "assunto", event.target.value)
                      }
                      placeholder="Assunto do email"
                    />
                  </div>
                  <SimplifiedEmailEditor
                    htmlContent={selectedTemplate.htmlContent}
                    onContentChange={content =>
                      updateTemplateField(selectedTemplate.id, "htmlContent", content)
                    }
                  />
                  <div className="flex gap-2 pt-2 border-t">
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
                      Salvar Alteracoes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="pt-5">
                  <div className="mb-3 text-xs text-muted-foreground">
                    Preview em tempo real com valores de exemplo para variaveis.
                  </div>
                  <div className="overflow-hidden rounded-md border bg-slate-50 dark:bg-slate-900">
                    <iframe
                      srcDoc={realtimePreviewDoc}
                      title="Realtime Funnel Email Preview"
                      className="w-full border-0"
                      style={{ height: "calc(100vh - 290px)", minHeight: "560px" }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione uma transmissao para abrir o editor.</p>
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
        title="Excluir Transmissão do Funil"
        description="Tem certeza que deseja excluir esta transmissão do funil? Esta ação não pode ser desfeita."
        itemName={deleteTemplateName}
        isLoading={deleteFunnelTemplate.isPending}
      />
    </div>
  );
}

