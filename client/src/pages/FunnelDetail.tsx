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
import { toast } from "sonner";
import { ArrowLeft, Plus, Loader2, Eye, Code, Settings, Trash2, Send, ChevronRight } from "lucide-react";
import { CreateItemModal } from "@/components/CreateItemModal";

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

  // Query para obter funil com templates
  const { data: funnelData, refetch: refetchFunnel, isLoading } = trpc.funnels.getWithTemplates.useQuery(
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
    { enabled: selectedTemplateId !== null && selectedTemplateId > 0 }
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
      setActiveTab("preview");
    }
  }, [previewTemplate.data]);

  const handleBack = () => {
    setLocation("/email-templates");
  };

  const handleCreateFunnelTemplate = (config: { delayValue: number; delayUnit: "days" | "weeks"; sendTime?: string }) => {
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
        delayUnit: template.delayUnit as "days" | "weeks",
        sendTime: template.sendTime || undefined,
      },
    });
  };

  const handleToggleActive = (templateId: number) => {
    toggleFunnelTemplateActive.mutate({ templateId });
  };

  const handleDeleteTemplate = (templateId: number) => {
    if (localTemplates.length <= 1) {
      toast.error("É necessário manter pelo menos um template no funil");
      return;
    }
    deleteFunnelTemplate.mutate({ templateId });
  };

  const handlePreview = (templateId: number) => {
    setSelectedTemplateId(templateId);
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
      {/* Header com navegação */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBack} size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Funil</span>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">{funnel.nome}</span>
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-bold tracking-tight">Automação de Emails</h2>
        <p className="text-muted-foreground mt-1">
          Configure e gerencie os envios de emails
        </p>
      </div>

      {/* Breadcrumb do Funil */}
      <div className="flex items-center gap-2 text-sm border-b pb-4">
        <span className="text-muted-foreground">Funil</span>
        <span className="font-medium">{funnel.nome}</span>
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

        <TabsContent value="templates" className="space-y-6">
          <div className="text-sm text-muted-foreground">Templates</div>

          <div className="space-y-4">
            {localTemplates.map((template, index) => (
              <Card key={template.id} className={`relative ${template.ativo === 0 ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-medium">
                        Template
                      </div>
                      <Input
                        value={template.nome}
                        onChange={(e) => updateTemplateField(template.id, "nome", e.target.value)}
                        className="text-base font-medium border-0 p-0 h-auto focus-visible:ring-0 max-w-xs"
                        placeholder="Nome do Template"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openHtmlEditor(template.id)}
                        className="h-8 w-8"
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                      </Button>
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-xs text-muted-foreground">Off</span>
                        <Switch
                          checked={template.ativo === 1}
                          onCheckedChange={() => handleToggleActive(template.id)}
                        />
                        <span className="text-xs text-primary">On</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {/* Informações de delay */}
                  {index > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Enviar após {template.delayValue} {template.delayUnit === "days" ? "dias" : "semanas"}
                      {template.sendTime && ` às ${template.sendTime}`}
                    </div>
                  )}
                  {index === 0 && (
                    <div className="text-xs text-muted-foreground">
                      Enviado imediatamente quando o lead entra no funil
                    </div>
                  )}

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
                  <div className="flex items-center justify-between pt-2 border-t">
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
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSaveTemplate(template.id)}
                        disabled={updateFunnelTemplate.isPending}
                      >
                        {updateFunnelTemplate.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      {localTemplates.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Botão para adicionar novo template */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              disabled={createFunnelTemplate.isPending}
              className="border-dashed"
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
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização do Email</CardTitle>
              <CardDescription>
                Visualize como o email será exibido
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
                  <p>Selecione um template e clique em "Visualizar" para ver a pré-visualização</p>
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
    </div>
  );
}
