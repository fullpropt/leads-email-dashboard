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
import { toast } from "sonner";
import { Upload, Eye, Send, Loader2, Plus, Trash2, Clock, Calendar } from "lucide-react";

interface TemplateBlock {
  id: number;
  nome: string;
  assunto: string;
  htmlContent: string;
  scheduleEnabled: boolean;
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

  const { data: allTemplates, refetch: refetchTemplates } =
    trpc.emailTemplates.list.useQuery();

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

  const previewTemplate = trpc.emailTemplates.previewWithFirstLead.useQuery(
    { htmlContent: "" },
    { enabled: false }
  );

  // Sincronizar templates do servidor com estado local
  React.useEffect(() => {
    if (allTemplates) {
      setTemplates(allTemplates.map(t => ({
        ...t,
        scheduleEnabled: t.scheduleEnabled === 1,
        scheduleIntervalType: t.scheduleIntervalType as "days" | "weeks",
      })));
    }
  }, [allTemplates]);

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

    const updates = {
      nome: template.nome,
      assunto: template.assunto,
      htmlContent: template.htmlContent,
      scheduleEnabled: template.scheduleEnabled ? 1 : 0,
      scheduleTime: template.scheduleTime,
      scheduleInterval: template.scheduleInterval,
      scheduleIntervalType: template.scheduleIntervalType,
    };

    updateTemplate.mutate({
      templateId,
      updates,
    });
  };

  const handleAddTemplate = () => {
    const newTemplate: TemplateBlock = {
      id: Date.now(), // ID temporário
      nome: "",
      assunto: "",
      htmlContent: "",
      scheduleEnabled: false,
      scheduleTime: "09:00",
      scheduleInterval: 1,
      scheduleIntervalType: "days",
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    // Criar template no servidor primeiro
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

  const handlePreview = async (htmlContent: string) => {
    if (!htmlContent) {
      toast.error("Nenhum conteúdo HTML para pré-visualizar");
      return;
    }
    
    const result = await previewTemplate.refetch({ htmlContent });
    if (result.data?.success) {
      setPreviewHtml(result.data.html);
      setActiveTab("preview");
    } else {
      toast.error(result.data?.message || "Erro ao gerar pré-visualização");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Templates de Email</h2>
        <p className="text-muted-foreground mt-1">
          Configure múltiplos templates com agendamento individual
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="templates" className="gap-2">
            <Calendar className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Pré-visualização
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
                      <Button
                        onClick={() => handlePreview(template.htmlContent)}
                        variant="outline"
                        size="sm"
                        disabled={!template.htmlContent}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleSaveTemplate(template.id)}
                        size="sm"
                        disabled={updateTemplate.isPending}
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
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Configurações de Agendamento */}
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <Label className="font-medium">Agendamento</Label>
                      </div>
                      <Switch
                        checked={template.scheduleEnabled}
                        onCheckedChange={(checked) => 
                          updateTemplateField(template.id, "scheduleEnabled", checked)
                        }
                      />
                    </div>
                    
                    {template.scheduleEnabled && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Hora</Label>
                          <Input
                            type="time"
                            value={template.scheduleTime}
                            onChange={(e) => updateTemplateField(template.id, "scheduleTime", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Intervalo</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              min="1"
                              value={template.scheduleInterval}
                              onChange={(e) => updateTemplateField(template.id, "scheduleInterval", parseInt(e.target.value))}
                              className="w-20"
                            />
                            <Select
                              value={template.scheduleIntervalType}
                              onValueChange={(value: "days" | "weeks") => 
                                updateTemplateField(template.id, "scheduleIntervalType", value)
                              }
                            >
                              <SelectTrigger className="w-24">
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
                          <Label>Próximo Envio</Label>
                          <Input
                            value="Calculado automaticamente"
                            disabled
                            className="text-muted-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Conteúdo HTML */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Conteúdo HTML</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".html"
                          onChange={(e) => handleFileUpload(template.id, e)}
                          className="max-w-xs"
                        />
                        <span className="text-xs text-muted-foreground">Upload HTML</span>
                      </div>
                    </div>
                    <Textarea
                      placeholder="Cole ou edite o HTML do email aqui... Use variáveis: {{nome}}, {{email}}, {{produto}}, {{plano}}, {{valor}}, {{data_compra}}"
                      value={template.htmlContent}
                      onChange={(e) => updateTemplateField(template.id, "htmlContent", e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Botão Adicionar Template */}
            <Button
              onClick={handleAddTemplate}
              variant="outline"
              className="w-full border-dashed"
              disabled={createTemplate.isPending}
            >
              {createTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Adicionar Novo Template
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização do Email</CardTitle>
              <CardDescription>
                Visualize como o email será exibido para os destinatários
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewHtml ? (
                <div className="border rounded-lg p-6 bg-white min-h-[500px]">
                  <iframe
                    srcDoc={previewHtml}
                    title="Email Preview"
                    className="w-full h-[600px] border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum template para pré-visualizar</p>
                  <p className="text-sm mt-2">
                    Clique no ícone de olho em qualquer template para pré-visualizar
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
