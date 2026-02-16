import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Code, FileText, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SimplifiedEmailEditorProps {
  htmlContent: string;
  onContentChange: (content: string) => void;
  onPreview?: () => void;
  isPreviewLoading?: boolean;
}

const FORMATTING_GUIDE = `
**Guia de Formatacao Simplificada:**

- Use # para titulo principal (H1)
- Use ## para subtitulo (H2)
- Use ### para titulo menor (H3)
- Use - ou * para listas
- Use 1. 2. 3. para listas numeradas
- Use **texto** para negrito
- Use *texto* para italico
- URLs sao convertidas automaticamente em links
- Use [BUTTON:Texto do Botao:https://url.com] para criar um botao
- Use [LINK:Texto do Link:https://url.com] para criar um link
- Use [EMAIL:exemplo@email.com] para criar um link de email
- Use uma linha vazia para separar paragrafos

**Importante:** Linhas consecutivas sem linha vazia entre elas serao agrupadas no mesmo paragrafo.

**Variaveis disponiveis:**
- {{nome}} - Nome do lead
- {{email}} - Email do lead
- {{produto}} - Nome do produto
- {{plano}} - Plano adquirido
- {{valor}} - Valor da compra

**Exemplo:**
# Welcome, {{nome}}!

Thank you for joining TubeTools.

Here's what you can do:
1. Watch amazing videos
2. Rate your favorites
3. Participate in the community

Visit our [LINK:website:https://tubetoolsacess.work] or contact us at [EMAIL:supfullpropt@gmail.com]

[BUTTON:Start Now:https://tubetoolsacess.work]

Best regards,
**The TubeTools Team**
`.trim();

export function SimplifiedEmailEditor({
  htmlContent,
  onContentChange,
  onPreview,
  isPreviewLoading = false,
}: SimplifiedEmailEditorProps) {
  const [editorMode, setEditorMode] = useState<"simple" | "html">("simple");
  const [showGuide, setShowGuide] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  const isComplexHtml =
    htmlContent.trim().toLowerCase().startsWith("<!doctype") ||
    htmlContent.trim().toLowerCase().startsWith("<html") ||
    /<(table|div|style)\b/i.test(htmlContent);

  useEffect(() => {
    if (isComplexHtml) {
      setEditorMode("html");
    }
  }, [isComplexHtml]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={editorMode} onValueChange={v => setEditorMode(v as "simple" | "html") }>
          <TabsList>
            <TabsTrigger value="simple" className="gap-2">
              <FileText className="h-4 w-4" />
              Modo Simples
            </TabsTrigger>
            <TabsTrigger value="html" className="gap-2">
              <Code className="h-4 w-4" />
              Modo HTML
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGuide(!showGuide)}
            className="gap-2"
          >
            <Info className="h-4 w-4" />
            {showGuide ? "Ocultar Guia" : "Ver Guia"}
          </Button>
          {onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              disabled={isPreviewLoading}
              className="gap-2"
            >
              {isPreviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Visualizar
            </Button>
          )}
        </div>
      </div>

      {showGuide && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <pre className="whitespace-pre-wrap text-xs font-mono mt-2">{FORMATTING_GUIDE}</pre>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">
                {editorMode === "simple" ? "Conteudo do Email" : "Codigo HTML"}
              </CardTitle>
              <CardDescription className="text-xs">
                {editorMode === "simple"
                  ? "Digite o texto do seu email. O sistema aplicara automaticamente estilos, header e footer com link de unsubscribe."
                  : "Edite o codigo HTML diretamente. Se nao incluir estrutura completa (DOCTYPE/html), o sistema adicionara header e footer automaticamente."}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={() => setContentExpanded(prev => !prev)}
            >
              {contentExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                  Recolher
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  Expandir
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contentExpanded ? (
            <Textarea
              value={htmlContent}
              onChange={e => onContentChange(e.target.value)}
              className={`min-h-[400px] ${editorMode === "html" ? "font-mono text-sm" : ""}`}
              placeholder={
                editorMode === "simple"
                  ? `# Welcome, {{nome}}!

Thank you for joining TubeTools.

Here's what you can do:
1. Watch amazing videos
2. Rate your favorites
3. Participate in the community

Visit our [LINK:website:https://tubetoolsacess.work] or contact us at [EMAIL:supfullpropt@gmail.com]

[BUTTON:Start Now:https://tubetoolsacess.work]

Best regards,
**The TubeTools Team**`
                  : `<h1 style="font-size: 28px; font-weight: bold; color: #000000; margin-bottom: 20px;">
  Welcome to TubeTools, {{nome}}!
</h1>

<p style="font-size: 16px; color: #333333; margin-bottom: 25px;">
  Thank you for joining our community.
</p>

<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center">
      <a href="https://tubetoolsacess.work" target="_blank" style="display: inline-block; padding: 14px 35px; background-color: #FF0000; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        Start Exploring Now
      </a>
    </td>
  </tr>
</table>`
              }
            />
          ) : (
            <div className="rounded-md border bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-muted-foreground">
              Editor recolhido para economizar espaco na tela.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Nota:</strong> O sistema aplica automaticamente:
        </p>
        <ul className="list-disc list-inside ml-2 space-y-0.5">
          <li>Header com logo TubeTools</li>
          <li>Estilos CSS padronizados (cores, fontes, botoes)</li>
          <li>Footer com informacoes de contato</li>
          <li>Link de unsubscribe automatico</li>
        </ul>
      </div>
    </div>
  );
}
