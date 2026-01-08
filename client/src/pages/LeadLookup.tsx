import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  User, 
  Mail, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Video,
  Wallet,
  History
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function LeadLookup() {
  const [email, setEmail] = useState("");
  const [searchEmail, setSearchEmail] = useState("");

  const { data, isLoading, error, refetch } = trpc.leads.getDetailedByEmail.useQuery(
    { email: searchEmail },
    { 
      enabled: !!searchEmail && searchEmail.includes("@"),
      retry: false,
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && email.includes("@")) {
      setSearchEmail(email);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));
  };

  const formatDateOnly = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Lead</h1>
        <p className="text-muted-foreground">
          Pesquise um lead por email para ver informações detalhadas, saldo, histórico de transações e mais.
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Lead
          </CardTitle>
          <CardDescription>
            Digite o email do lead para consultar todas as informações disponíveis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-3">
            <Input
              type="email"
              placeholder="exemplo@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !email.includes("@")}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Erro ao buscar lead: {error.message}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not Found State */}
      {data && !data.found && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Lead não encontrado</h3>
              <p className="text-muted-foreground">
                Não foi encontrado nenhum registro para o email "{searchEmail}"
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data && data.found && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Saldo Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Atual</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {data.tubetools ? formatCurrency(data.tubetools.user.balance) : "-"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.tubetools ? `Total ganho: ${formatCurrency(data.tubetools.stats.totalEarned)}` : "Não cadastrado no TubeTools"}
                </p>
              </CardContent>
            </Card>

            {/* Total Votos Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Votos</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.tubetools?.stats.totalVotes ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Streak atual: {data.tubetools?.user.votingStreak ?? 0} dias
                </p>
              </CardContent>
            </Card>

            {/* Dias Ativos Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dias Ativos</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.tubetools?.stats.activeDays ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Último voto: {formatDateOnly(data.tubetools?.user.lastVotedAt)}
                </p>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {data.mailmkt?.hasAccessedPlatform ? (
                    <Badge variant="default" className="w-fit bg-green-600">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Acessou Plataforma
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="w-fit">
                      <XCircle className="mr-1 h-3 w-3" />
                      Não Acessou
                    </Badge>
                  )}
                  <Badge variant="outline" className="w-fit">
                    {data.mailmkt?.leadType ?? "N/A"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Info Tabs */}
          <Tabs defaultValue="info" className="space-y-4">
            <TabsList>
              <TabsTrigger value="info" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Informações
              </TabsTrigger>
              <TabsTrigger value="transactions" className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Transações
              </TabsTrigger>
              <TabsTrigger value="votes" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Votos
              </TabsTrigger>
              <TabsTrigger value="emails" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Emails
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Saques
              </TabsTrigger>
            </TabsList>

            {/* Info Tab */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* MailMKT Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Dados do MailMKT
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.mailmkt ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nome:</span>
                          <span className="font-medium">{data.mailmkt.nome}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-medium">{data.mailmkt.email}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Produto:</span>
                          <span className="font-medium">{data.mailmkt.produto ?? "-"}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Plano:</span>
                          <span className="font-medium">{data.mailmkt.plano ?? "-"}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valor:</span>
                          <span className="font-medium">{formatCurrency(data.mailmkt.valor / 100)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Data Criação:</span>
                          <span className="font-medium">{formatDate(data.mailmkt.dataCriacao)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant={data.mailmkt.status === "active" ? "default" : "secondary"}>
                            {data.mailmkt.status}
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email Enviado:</span>
                          {data.mailmkt.emailEnviado ? (
                            <Badge variant="default" className="bg-green-600">Sim</Badge>
                          ) : (
                            <Badge variant="secondary">Não</Badge>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        Lead não encontrado no MailMKT
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* TubeTools Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Video className="h-5 w-5" />
                      Dados do TubeTools
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.tubetools ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nome:</span>
                          <span className="font-medium">{data.tubetools.user.name}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Saldo:</span>
                          <span className="font-medium text-green-600">{formatCurrency(data.tubetools.user.balance)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Ganho:</span>
                          <span className="font-medium">{formatCurrency(data.tubetools.stats.totalEarned)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Sacado:</span>
                          <span className="font-medium">{formatCurrency(data.tubetools.stats.totalWithdrawn)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Saques Pendentes:</span>
                          <span className="font-medium">{formatCurrency(data.tubetools.stats.pendingWithdrawals)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Voting Streak:</span>
                          <span className="font-medium">{data.tubetools.user.votingStreak} dias</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Dias Ativos:</span>
                          <span className="font-medium">{data.tubetools.stats.activeDays}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Votos Restantes Hoje:</span>
                          <span className="font-medium">{data.tubetools.user.dailyVotesLeft}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cadastro:</span>
                          <span className="font-medium">{formatDate(data.tubetools.user.createdAt)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Último Voto:</span>
                          <span className="font-medium">{formatDate(data.tubetools.user.lastVotedAt)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        Usuário não encontrado no TubeTools
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Transações</CardTitle>
                  <CardDescription>
                    Últimas 50 transações do usuário
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.tubetools?.transactions && data.tubetools.transactions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.tubetools.transactions.map((tx: { id: string; type: string; amount: number; description: string; status: string; createdAt: string | Date }) => (
                          <TableRow key={tx.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(tx.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={tx.type === "credit" ? "default" : "destructive"}>
                                {tx.type === "credit" ? (
                                  <ArrowUpRight className="mr-1 h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="mr-1 h-3 w-3" />
                                )}
                                {tx.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate">
                              {tx.description}
                            </TableCell>
                            <TableCell>
                              <Badge variant={tx.status === "completed" ? "outline" : "secondary"}>
                                {tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${tx.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                              {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma transação encontrada
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Votes Tab */}
            <TabsContent value="votes">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Votos</CardTitle>
                  <CardDescription>
                    Últimos 50 votos do usuário
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.tubetools?.votes && data.tubetools.votes.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Vídeo</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Recompensa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.tubetools.votes.map((vote: { id: string; videoId: string; videoTitle: string | null; voteType: string; rewardAmount: number; createdAt: string | Date }) => (
                          <TableRow key={vote.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(vote.createdAt)}
                            </TableCell>
                            <TableCell className="max-w-[400px] truncate">
                              {vote.videoTitle || vote.videoId}
                            </TableCell>
                            <TableCell>
                              <Badge variant={vote.voteType === "like" ? "default" : "secondary"}>
                                {vote.voteType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              +{formatCurrency(vote.rewardAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum voto encontrado
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Emails Tab */}
            <TabsContent value="emails">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Emails</CardTitle>
                  <CardDescription>
                    Emails enviados para este lead
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.mailmkt?.emailHistory && data.mailmkt.emailHistory.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Template</TableHead>
                          <TableHead>Tipo de Envio</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.mailmkt.emailHistory.map((email: { id: number; templateId: number; templateName: string | null; sendType: string; sentAt: string | Date; status: string; errorMessage: string | null }) => (
                          <TableRow key={email.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(email.sentAt)}
                            </TableCell>
                            <TableCell>{email.templateName ?? `Template #${email.templateId}`}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{email.sendType}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={email.status === "sent" ? "default" : "destructive"}>
                                {email.status === "sent" ? (
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                ) : (
                                  <XCircle className="mr-1 h-3 w-3" />
                                )}
                                {email.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum email enviado para este lead
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Withdrawals Tab */}
            <TabsContent value="withdrawals">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Saques</CardTitle>
                  <CardDescription>
                    Solicitações de saque do usuário
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.tubetools?.withdrawals && data.tubetools.withdrawals.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data Solicitação</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data Processamento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.tubetools.withdrawals.map((withdrawal: { id: string; amount: number; status: string; requestedAt: string | Date; processedAt: string | Date | null; bankDetails: unknown }) => (
                          <TableRow key={withdrawal.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(withdrawal.requestedAt)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(withdrawal.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  withdrawal.status === "completed" ? "default" : 
                                  withdrawal.status === "pending" ? "secondary" : 
                                  "destructive"
                                }
                              >
                                {withdrawal.status === "completed" && <CheckCircle className="mr-1 h-3 w-3" />}
                                {withdrawal.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                                {withdrawal.status === "rejected" && <XCircle className="mr-1 h-3 w-3" />}
                                {withdrawal.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(withdrawal.processedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum saque solicitado
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
