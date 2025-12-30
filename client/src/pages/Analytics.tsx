import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Calendar,
  Award,
  Target,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function Analytics() {
  // Buscar estatísticas de leads (MailMKT)
  const { data: accessStats, refetch: refetchAccessStats } = trpc.leads.getAccessStats.useQuery(
    undefined,
    {
      staleTime: 10000,
      refetchOnWindowFocus: false,
    }
  );

  // Buscar analytics do TubeTools
  const { data: tubetoolsAnalytics, isLoading, refetch: refetchAnalytics } = trpc.tubetools.getAnalytics.useQuery(
    undefined,
    {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  );

  const handleRefresh = async () => {
    toast.info("Atualizando dados...");
    await Promise.all([refetchAccessStats(), refetchAnalytics()]);
    toast.success("Dados atualizados!");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tubetoolsAnalytics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Não foi possível carregar os dados do TubeTools</p>
        <p className="text-sm text-muted-foreground">Verifique se a variável TUBETOOLS_DATABASE_URL está configurada</p>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar Novamente
        </Button>
      </div>
    );
  }

  const { stats, votes, topUsersByBalance, topUsersByStreak, userGrowth } = tubetoolsAnalytics;

  // Calcular taxa de conversão (leads que compraram → acessaram plataforma)
  const conversionRate = accessStats && accessStats.total > 0
    ? ((accessStats.accessed / accessStats.total) * 100).toFixed(1)
    : "0.0";

  // Calcular taxa de engajamento (usuários ativos / total)
  const engagementRate = stats.totalUsers > 0
    ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)
    : "0.0";

  // Calcular taxa de usuários com ganhos
  const earningsRate = stats.totalUsers > 0
    ? ((stats.usersWithEarnings / stats.totalUsers) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Análise detalhada do comportamento dos leads e usuários
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Alertas e Insights */}
      {accessStats && parseFloat(conversionRate) < 10 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-900">Taxa de Conversão Baixa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-800">
              Apenas <strong>{conversionRate}%</strong> dos leads que compraram acessaram a plataforma.
              Considere enviar emails de engajamento para os {accessStats.notAccessed} leads inativos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cards de Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total de Leads (Compras) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accessStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Compras aprovadas</p>
          </CardContent>
        </Card>

        {/* Acessaram Plataforma */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acessaram Plataforma</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{accessStats?.accessed || 0}</div>
            <p className="text-xs text-muted-foreground">
              {conversionRate}% de conversão
            </p>
          </CardContent>
        </Card>

        {/* Não Acessaram */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não Acessaram</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{accessStats?.notAccessed || 0}</div>
            <p className="text-xs text-muted-foreground">
              Oportunidade de engajamento
            </p>
          </CardContent>
        </Card>

        {/* Usuários Ativos (7 dias) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {engagementRate}% de engajamento (7 dias)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas da Plataforma TubeTools */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total de Usuários Cadastrados */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Cadastrados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.recentUsers} novos (7 dias)
            </p>
          </CardContent>
        </Card>

        {/* Saldo Total Distribuído */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {stats.totalBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Média: R$ {stats.avgBalance.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {/* Total de Votos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Votos</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{votes.totalVotes}</div>
            <p className="text-xs text-muted-foreground">
              Recompensas: R$ {votes.totalRewardsDistributed.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {/* Maior Streak */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maior Streak</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.maxVotingStreak} dias</div>
            <p className="text-xs text-muted-foreground">
              Média: {stats.avgVotingStreak.toFixed(1)} dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabelas de Top Usuários */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top 10 por Saldo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top 10 - Maior Saldo
            </CardTitle>
            <CardDescription>Usuários com maior saldo acumulado</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Streak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsersByBalance.slice(0, 10).map((user: any, index: number) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      R$ {Number(user.balance).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{user.voting_streak} dias</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top 10 por Streak */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Top 10 - Maior Streak
            </CardTitle>
            <CardDescription>Usuários com maior sequência de dias consecutivos</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Streak</TableHead>
                  <TableHead className="text-right">Dias Votados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsersByStreak.slice(0, 10).map((user: any, index: number) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="default" className="bg-orange-600">
                        {user.voting_streak} dias
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.voting_days_count} dias
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Informações Temporais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Informações Temporais
          </CardTitle>
          <CardDescription>Datas importantes e crescimento</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Primeiro Usuário</p>
              <p className="text-lg font-semibold">
                {stats.firstUserDate
                  ? format(new Date(stats.firstUserDate), "dd/MM/yyyy HH:mm", { locale: ptBR })
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Último Usuário</p>
              <p className="text-lg font-semibold">
                {stats.lastUserDate
                  ? format(new Date(stats.lastUserDate), "dd/MM/yyyy HH:mm", { locale: ptBR })
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Novos Usuários (7 dias)</p>
              <p className="text-lg font-semibold">{stats.recentUsers}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo de Métricas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Resumo de Métricas
          </CardTitle>
          <CardDescription>Visão geral do desempenho</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Taxa de Conversão (Compra → Acesso)</span>
              <Badge variant={parseFloat(conversionRate) > 10 ? "default" : "destructive"}>
                {conversionRate}%
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Taxa de Engajamento (Ativos 7 dias)</span>
              <Badge variant={parseFloat(engagementRate) > 20 ? "default" : "secondary"}>
                {engagementRate}%
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Usuários com Ganhos</span>
              <Badge variant="secondary">
                {earningsRate}% ({stats.usersWithEarnings}/{stats.totalUsers})
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Média de Dias Votados</span>
              <Badge variant="outline">{stats.avgVotingDays.toFixed(1)} dias</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
