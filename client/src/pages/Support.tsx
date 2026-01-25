import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Mail,
  Inbox,
  FolderOpen,
  Bot,
  Send,
  RefreshCw,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Edit3,
  MessageSquare,
  Users,
  Loader2,
} from "lucide-react";

// Tipos
interface SupportEmail {
  id: number;
  messageId: string | null;
  sender: string;
  senderName: string | null;
  recipient: string;
  subject: string;
  bodyPlain: string | null;
  bodyHtml: string | null;
  strippedText: string | null;
  groupId: number | null;
  status: string;
  receivedAt: string;
}

interface SupportGroup {
  id: number;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  aiSummary: string | null;
  aiKeywords: string | null;
  aiSentiment: string | null;
  aiPriority: string;
  emailCount: number;
  pendingCount: number;
  status: string;
}

interface SupportResponse {
  id: number;
  subject: string;
  bodyHtml: string;
  bodyPlain: string | null;
  aiGenerated: number;
  status: string;
}

export default function Support() {
  const [selectedGroup, setSelectedGroup] = useState<SupportGroup | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<SupportEmail | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showResponseEditor, setShowResponseEditor] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [editedResponse, setEditedResponse] = useState({ subject: "", bodyHtml: "" });
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  // Queries
  const statsQuery = trpc.support.getStats.useQuery();
  const groupsQuery = trpc.support.listGroups.useQuery({ status: "active" });
  const groupDetailQuery = trpc.support.getGroupById.useQuery(
    { groupId: selectedGroup?.id ?? 0 },
    { enabled: !!selectedGroup }
  );
  const ungroupedQuery = trpc.support.getUngroupedEmails.useQuery();

  // Mutations
  const classifyMutation = trpc.support.classifyEmails.useMutation({
    onSuccess: (data) => {
      toast.success(`Classificação concluída: ${data.processed} emails processados, ${data.newGroups} novos grupos`);
      groupsQuery.refetch();
      ungroupedQuery.refetch();
      statsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro na classificação: ${error.message}`);
    },
  });

  const generateResponseMutation = trpc.support.generateGroupResponse.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Resposta gerada com sucesso!");
        groupDetailQuery.refetch();
      } else {
        toast.error(data.error || "Erro ao gerar resposta");
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const regenerateResponseMutation = trpc.support.regenerateResponse.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Resposta regenerada com sucesso!");
        groupDetailQuery.refetch();
      } else {
        toast.error(data.error || "Erro ao regenerar resposta");
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const updateResponseMutation = trpc.support.updateResponse.useMutation({
    onSuccess: () => {
      toast.success("Resposta atualizada!");
      groupDetailQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const sendGroupResponseMutation = trpc.support.sendGroupResponse.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Enviado para ${data.sent} emails!`);
      } else {
        toast.warning(`Enviado: ${data.sent}, Falhas: ${data.failed}`);
      }
      groupDetailQuery.refetch();
      statsQuery.refetch();
      setShowSendConfirm(false);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Helpers
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "destructive";
      case "high": return "default";
      case "normal": return "secondary";
      case "low": return "outline";
      default: return "secondary";
    }
  };

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case "positive": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "negative": return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleGenerateResponse = () => {
    if (!selectedGroup) return;
    generateResponseMutation.mutate({
      groupId: selectedGroup.id,
      instructions: aiInstructions || undefined,
    });
  };

  const handleRegenerateResponse = () => {
    const response = groupDetailQuery.data?.suggestedResponse;
    if (!response) return;
    regenerateResponseMutation.mutate({
      responseId: response.id,
      instructions: aiInstructions,
    });
  };

  const handleSaveResponse = () => {
    const response = groupDetailQuery.data?.suggestedResponse;
    if (!response) return;
    updateResponseMutation.mutate({
      responseId: response.id,
      subject: editedResponse.subject,
      bodyHtml: editedResponse.bodyHtml,
    });
    setShowResponseEditor(false);
  };

  const handleSendResponse = () => {
    const response = groupDetailQuery.data?.suggestedResponse;
    if (!response || !selectedGroup) return;
    sendGroupResponseMutation.mutate({
      groupId: selectedGroup.id,
      responseId: response.id,
    });
  };

  // Inicializar editor quando resposta carregar
  const response = groupDetailQuery.data?.suggestedResponse;
  if (response && editedResponse.subject === "" && editedResponse.bodyHtml === "") {
    setEditedResponse({
      subject: response.subject,
      bodyHtml: response.bodyHtml,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suporte por Email</h1>
          <p className="text-muted-foreground">
            Gerencie emails de suporte com classificação por IA
          </p>
        </div>
        <Button
          onClick={() => classifyMutation.mutate()}
          disabled={classifyMutation.isPending || (ungroupedQuery.data?.length ?? 0) === 0}
        >
          {classifyMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Bot className="mr-2 h-4 w-4" />
          )}
          Classificar Emails ({ungroupedQuery.data?.length ?? 0})
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsQuery.data?.totalEmails ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {statsQuery.data?.pendingEmails ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Respondidos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statsQuery.data?.respondedEmails ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Grupos Ativos</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsQuery.data?.activeGroups ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Groups List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Grupos de Email
            </CardTitle>
            <CardDescription>
              Emails agrupados por similaridade
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {groupsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : groupsQuery.data?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum grupo criado ainda</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clique em "Classificar Emails" para agrupar
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {groupsQuery.data?.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                      className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                        selectedGroup?.id === group.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{group.nome}</span>
                            {getSentimentIcon(group.aiSentiment)}
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {group.descricao || group.categoria || "Sem descrição"}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={getPriorityColor(group.aiPriority)}>
                              {group.aiPriority}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              <Users className="h-3 w-3 inline mr-1" />
                              {group.emailCount} emails
                            </span>
                            {group.pendingCount > 0 && (
                              <span className="text-xs text-yellow-600">
                                ({group.pendingCount} pendentes)
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Group Detail */}
        <Card className="lg:col-span-2">
          {selectedGroup ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedGroup.nome}</CardTitle>
                    <CardDescription>{selectedGroup.descricao}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => groupDetailQuery.refetch()}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {selectedGroup.aiKeywords && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {JSON.parse(selectedGroup.aiKeywords).map((keyword: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="emails">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="emails">
                      <Mail className="h-4 w-4 mr-2" />
                      Emails ({groupDetailQuery.data?.emails?.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="response">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Resposta
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="emails" className="mt-4">
                    <ScrollArea className="h-[350px]">
                      {groupDetailQuery.isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {groupDetailQuery.data?.emails?.map((email) => (
                            <button
                              key={email.id}
                              onClick={() => {
                                setSelectedEmail(email);
                                setShowEmailDialog(true);
                              }}
                              className="w-full p-3 border rounded-lg text-left hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">
                                      {email.senderName || email.sender}
                                    </span>
                                    <Badge
                                      variant={
                                        email.status === "responded"
                                          ? "default"
                                          : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {email.status}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {email.subject}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatDate(email.receivedAt)}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="response" className="mt-4 space-y-4">
                    {/* AI Instructions */}
                    <div className="space-y-2">
                      <Label>Instruções para a IA</Label>
                      <Textarea
                        placeholder="Ex: Responda de forma mais formal, mencione que estamos investigando o problema..."
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleGenerateResponse}
                          disabled={generateResponseMutation.isPending}
                        >
                          {generateResponseMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          {groupDetailQuery.data?.suggestedResponse
                            ? "Regenerar Resposta"
                            : "Gerar Resposta"}
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Response Preview */}
                    {groupDetailQuery.data?.suggestedResponse ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Resposta Gerada</Label>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditedResponse({
                                  subject: groupDetailQuery.data.suggestedResponse!.subject,
                                  bodyHtml: groupDetailQuery.data.suggestedResponse!.bodyHtml,
                                });
                                setShowResponseEditor(true);
                              }}
                            >
                              <Edit3 className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setShowSendConfirm(true)}
                              disabled={sendGroupResponseMutation.isPending}
                            >
                              {sendGroupResponseMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 mr-1" />
                              )}
                              Enviar para Todos
                            </Button>
                          </div>
                        </div>
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <p className="font-medium mb-2">
                            Assunto: {groupDetailQuery.data.suggestedResponse.subject}
                          </p>
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{
                              __html: groupDetailQuery.data.suggestedResponse.bodyHtml,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                          Nenhuma resposta gerada ainda
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Clique em "Gerar Resposta" para criar uma resposta automática
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] text-center px-4">
              <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Selecione um grupo</h3>
              <p className="text-muted-foreground mt-1">
                Escolha um grupo na lista para ver os emails e gerenciar respostas
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Email Detail Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmail?.subject}</DialogTitle>
            <DialogDescription>
              De: {selectedEmail?.senderName || selectedEmail?.sender}
              <br />
              Recebido em: {selectedEmail && formatDate(selectedEmail.receivedAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedEmail?.bodyHtml ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm">
                {selectedEmail?.strippedText || selectedEmail?.bodyPlain || "Sem conteúdo"}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Response Editor Dialog */}
      <Dialog open={showResponseEditor} onOpenChange={setShowResponseEditor}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Resposta</DialogTitle>
            <DialogDescription>
              Edite a resposta antes de enviar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input
                value={editedResponse.subject}
                onChange={(e) =>
                  setEditedResponse({ ...editedResponse, subject: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo (HTML)</Label>
              <Textarea
                value={editedResponse.bodyHtml}
                onChange={(e) =>
                  setEditedResponse({ ...editedResponse, bodyHtml: e.target.value })
                }
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResponseEditor(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveResponse} disabled={updateResponseMutation.isPending}>
              {updateResponseMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Envio</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a enviar esta resposta para{" "}
              <strong>{selectedGroup?.pendingCount ?? 0}</strong> emails pendentes do grupo "
              {selectedGroup?.nome}".
              <br />
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendResponse}>
              Enviar para Todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
