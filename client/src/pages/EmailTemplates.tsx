import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, Eye, Send, Loader2 } from "lucide-react";

export default function EmailTemplates() {
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const { data: activeTemplate, refetch: refetchActive } =
    trpc.emailTemplates.getActive.useQuery();

  const createTemplate = trpc.emailTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template criado e ativado com sucesso!");
      setNome("");
      setAssunto("");
      setHtmlContent("");
      refetchActive();
    },
    onError: () => {
      toast.error("Erro ao criar template");
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".html")) {
      toast.error("Por favor, selecione um arquivo HTML");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setHtmlContent(content);
      toast.success("Arquivo carregado com sucesso!");
    };
    reader.readAsText(file);
  };

  const handlePreview = () => {
    if (!htmlContent) {
      toast.error("Nenhum conteúdo HTML para pré-visualizar");
      return;
    }
    setPreviewHtml(htmlContent);
  };

  const handleSaveTemplate = () => {
    if (!nome || !assunto || !htmlContent) {
      toast.error("Preencha todos os campos");
      return;
    }

    createTemplate.mutate({
      nome,
      assunto,
      htmlContent,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Templates de Email</h2>
        <p className="text-muted-foreground mt-1">
          Configure e pré-visualize os emails que serão enviados aos leads
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Template
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Pré-visualização
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Novo Template de Email</CardTitle>
              <CardDescription>
                Faça upload de um arquivo HTML para criar um novo template. Use as variáveis: {"{{nome}}"}, {"{{email}}"}, {"{{produto}}"}, {"{{plano}}"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Template</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Boas-vindas Produto X"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assunto">Assunto do Email</Label>
                <Input
                  id="assunto"
                  placeholder="Ex: Bem-vindo! Aqui está seu acesso"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Arquivo HTML</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".html"
                  onChange={handleFileUpload}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="htmlContent">Conteúdo HTML</Label>
                <Textarea
                  id="htmlContent"
                  placeholder="Cole ou edite o HTML do email aqui..."
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handlePreview}
                  variant="outline"
                  className="gap-2"
                  disabled={!htmlContent}
                >
                  <Eye className="h-4 w-4" />
                  Pré-visualizar
                </Button>
                <Button
                  onClick={handleSaveTemplate}
                  className="gap-2"
                  disabled={createTemplate.isPending || !nome || !assunto || !htmlContent}
                >
                  {createTemplate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Salvar e Ativar Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {activeTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Template Ativo Atual</CardTitle>
                <CardDescription>
                  Este é o template que será usado para enviar emails aos leads
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-muted-foreground">Nome</Label>
                  <p className="font-medium">{activeTemplate.nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Assunto</Label>
                  <p className="font-medium">{activeTemplate.assunto}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Última Atualização</Label>
                  <p className="text-sm">
                    {new Date(activeTemplate.atualizadoEm).toLocaleString("pt-BR")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
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
              {previewHtml || (activeTemplate && activeTemplate.htmlContent) ? (
                <div className="border rounded-lg p-6 bg-white min-h-[500px]">
                  <iframe
                    srcDoc={previewHtml || activeTemplate?.htmlContent}
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
                    Faça upload de um template ou clique em "Pré-visualizar" após
                    adicionar conteúdo HTML
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
