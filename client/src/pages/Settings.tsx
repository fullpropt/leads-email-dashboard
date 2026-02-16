import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Shield, KeyRound, ChevronDown, ChevronUp } from "lucide-react";

type AIProvider = "none" | "openai" | "gemini";

const MODEL_OPTIONS: Record<AIProvider, string[]> = {
  none: [],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  gemini: ["gemini-2.0-flash-lite-001", "gemini-2.0-flash", "gemini-1.5-flash"],
};

function getDefaultModel(provider: AIProvider) {
  return MODEL_OPTIONS[provider][0] || "";
}

function normalizeModelForProvider(provider: AIProvider, currentModel: string) {
  const options = MODEL_OPTIONS[provider];
  if (!options.length) return "";
  if (options.includes(currentModel)) return currentModel;
  return options[0];
}

function compactMaskedKey(masked: string | null | undefined) {
  if (!masked) return "";
  const normalized = masked.trim();
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

export default function SettingsPage() {
  const { data: aiSettings, refetch: refetchAiSettings } = trpc.settings.getEmailAi.useQuery();
  const { data: localAuthInfo, refetch: refetchLocalAuthInfo } = trpc.settings.getLocalAuthInfo.useQuery();

  const updateEmailAi = trpc.settings.updateEmailAi.useMutation({
    onSuccess: async () => {
      toast.success("Configuracoes de IA salvas.");
      await refetchAiSettings();
      setApiKey("");
      setClearApiKey(false);
    },
    onError: () => {
      toast.error("Falha ao salvar configuracoes de IA.");
    },
  });

  const testEmailAi = trpc.settings.testEmailAi.useMutation({
    onSuccess: result => {
      const base = `Provider: ${result.provider} | Modelo: ${result.model}`;
      if (result.success && result.applied) {
        toast.success(`Teste IA OK. ${base}`);
        return;
      }

      if (result.reason?.startsWith("error:")) {
        toast.error(`Falha IA: ${result.reason.replace(/^error:/, "").trim()}`);
        return;
      }

      toast.message(`Teste IA sem variacao. Motivo: ${result.reason || "desconhecido"}`);
    },
    onError: () => {
      toast.error("Falha ao testar IA.");
    },
  });

  const changeLocalPassword = trpc.settings.changeLocalPassword.useMutation({
    onSuccess: async result => {
      if (result.success) {
        toast.success("Senha local atualizada.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        await refetchLocalAuthInfo();
      } else {
        toast.error(result.message || "Falha ao atualizar senha.");
      }
    },
    onError: () => {
      toast.error("Falha ao atualizar senha.");
    },
  });

  const [aiProvider, setAiProvider] = useState<AIProvider>("none");
  const [aiModel, setAiModel] = useState("");
  const [rewriteIntensity, setRewriteIntensity] = useState(12);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [showExtraInstructions, setShowExtraInstructions] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);

  const [currentEmail, setCurrentEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    if (!aiSettings) return;
    const provider = (aiSettings.provider || "none") as AIProvider;
    setAiProvider(provider);
    setAiModel(normalizeModelForProvider(provider, aiSettings.model || ""));
    setRewriteIntensity(aiSettings.rewriteIntensity ?? 12);
    setExtraInstructions(aiSettings.extraInstructions || "");
  }, [aiSettings]);

  useEffect(() => {
    if (!localAuthInfo) return;
    setCurrentEmail(localAuthInfo.email || "");
    setNewEmail(localAuthInfo.email || "");
  }, [localAuthInfo]);

  const saveAISettings = () => {
    updateEmailAi.mutate({
      provider: aiProvider,
      model: aiModel || getDefaultModel(aiProvider),
      rewriteIntensity: Math.max(0, Math.min(40, Math.floor(rewriteIntensity || 0))),
      extraInstructions,
      apiKey: apiKey.trim() ? apiKey.trim() : undefined,
      clearApiKey,
    });
  };

  const handleProviderChange = (value: string) => {
    const provider = value as AIProvider;
    setAiProvider(provider);
    setAiModel(current => normalizeModelForProvider(provider, current));
  };

  const handleChangePassword = () => {
    if (!currentEmail.trim() || !currentPassword.trim()) {
      toast.error("Informe email e senha atuais.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("A confirmacao da nova senha nao confere.");
      return;
    }

    changeLocalPassword.mutate({
      currentEmail: currentEmail.trim(),
      currentPassword,
      newEmail: newEmail.trim() || undefined,
      newPassword,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configuracoes</h2>
        <p className="text-muted-foreground mt-1">
          IA para variacao de copy, credenciais locais e ajustes operacionais.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Variacao de Copy com IA
          </CardTitle>
          <CardDescription>
            Gera pequenas variacoes por servico para diferenciar mensagens enviadas por cada conta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Desativado</SelectItem>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Modelo</Label>
              <Select
                value={aiProvider === "none" ? undefined : aiModel}
                onValueChange={setAiModel}
                disabled={aiProvider === "none"}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      aiProvider === "none"
                        ? "Selecione um provider"
                        : "Selecione um modelo"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS[aiProvider].map(model => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Intensidade de alteracao (%)</Label>
              <Input
                type="number"
                min={0}
                max={40}
                value={rewriteIntensity}
                onChange={event =>
                  setRewriteIntensity(
                    Number.isNaN(Number(event.target.value))
                      ? 12
                      : Number(event.target.value)
                  )
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>API Key</Label>
              {aiSettings?.apiKeyMasked ? (
                <p className="text-xs text-muted-foreground">
                  Atual: <span className="font-mono">{compactMaskedKey(aiSettings.apiKeyMasked)}</span>
                </p>
              ) : null}
              <Input
                type="password"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                placeholder="Cole uma nova chave para atualizar"
              />
              <div className="flex items-center gap-2">
                <Switch checked={clearApiKey} onCheckedChange={setClearApiKey} />
                <span className="text-xs text-muted-foreground">Limpar chave salva</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Instrucoes extras para a IA (opcional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowExtraInstructions(prev => !prev)}
              >
                {showExtraInstructions ? (
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
            {showExtraInstructions ? (
              <Textarea
                value={extraInstructions}
                onChange={event => setExtraInstructions(event.target.value)}
                placeholder="Ex: manter tom mais formal, evitar palavras muito promocionais..."
                className="min-h-[100px]"
              />
            ) : (
              <div className="rounded-md border bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-muted-foreground">
                Campo recolhido para economizar espaco na tela.
              </div>
            )}
          </div>

          <Button
            onClick={saveAISettings}
            disabled={updateEmailAi.isPending}
            className="w-full"
          >
            {updateEmailAi.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Salvar configuracoes de IA
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => testEmailAi.mutate()}
            disabled={testEmailAi.isPending}
          >
            {testEmailAi.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Testar IA
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Login Local
          </CardTitle>
          <CardDescription>
            Atualize email e senha para acesso local (sem OAuth).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border p-3 text-sm">
            <p>
              Status:{" "}
              <strong>{localAuthInfo?.configured ? "Configurado" : "Nao configurado"}</strong>
            </p>
            <p>Origem: <strong>{localAuthInfo?.source || "none"}</strong></p>
            <p>Email atual: <strong>{localAuthInfo?.email || "-"}</strong></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email atual</Label>
              <Input
                value={currentEmail}
                onChange={event => setCurrentEmail(event.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Novo email</Label>
              <Input
                value={newEmail}
                onChange={event => setNewEmail(event.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={event => setConfirmNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changeLocalPassword.isPending}
            className="w-full"
          >
            {changeLocalPassword.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="h-4 w-4 mr-2" />
            )}
            Atualizar email e senha local
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
