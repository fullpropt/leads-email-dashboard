import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Mail, Send, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FilterStatus = 'all' | 'pending' | 'sent';

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  // Usando o hook useDebounce para evitar muitas requisições
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  // Resetar para página 1 quando o termo de busca mudar
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  // Carregar dados dos leads com paginação E BUSCA SERVER-SIDE
  const { data: leadsData, isLoading, refetch } = trpc.leads.listPaginated.useQuery(
    { 
      page: currentPage, 
      status: filterStatus,
      search: debouncedSearchTerm // Enviando termo de busca para o backend
    },
    {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  // Carregar status do auto-envio
  const { data: autoSendStatus } = trpc.autoSend.getStatus.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Atualizar o estado quando o status for carregado
  useEffect(() => {
    if (autoSendStatus !== undefined) {
      setAutoSendEnabled(autoSendStatus);
    }
  }, [autoSendStatus]);

  // NÃO FILTRAR MAIS NO FRONTEND - Usar dados diretos do backend
  const leads = leadsData?.leads || [];

  const updateEmailStatus = trpc.leads.updateEmailStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      refetch();
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  const sendEmailToLead = trpc.email.sendToLead.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        refetch();
      } else {
        toast.error(data.message);
      }
    },
    onError: () => {
      toast.error("Erro ao enviar email");
    },
  });

  const sendToAllPending = trpc.email.sendToAllPending.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: () => {
      toast.error("Erro ao enviar emails");
    },
  });

  const toggleAutoSend = trpc.autoSend.toggle.useMutation({
    onSuccess: () => {
      setAutoSendEnabled(!autoSendEnabled);
      toast.success(autoSendEnabled ? "Envio automático desativado" : "Envio automático ativado");
    },
    onError: () => {
      toast.error("Erro ao alterar configuração de auto-envio");
    },
  });

  const handleToggleEmailStatus = (leadId: number, currentStatus: number) => {
    updateEmailStatus.mutate({
      leadId,
      enviado: currentStatus === 0,
    });
  };

  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status);
    setCurrentPage(1); // Voltar para página 1 ao mudar filtro
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  const totalPages = leadsData?.totalPages || 1;
  const total = leadsData?.total || 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie os leads capturados do PerfectPay
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              variant={autoSendEnabled ? "destructive" : "default"}
              size="sm"
              onClick={() => toggleAutoSend.mutate(!autoSendEnabled)}
              disabled={toggleAutoSend.isPending}
              className="gap-2"
            >
              {toggleAutoSend.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {autoSendEnabled ? "Desativar Envio Automático" : "Ativar Envio Automático"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => sendToAllPending.mutate()}
              disabled={sendToAllPending.isPending}
              className="gap-2"
            >
              {sendToAllPending.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar para Todos Pendentes
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou produto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8"
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm("")}
            >
              Limpar
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('all')}
          >
            Todos
          </Button>
          <Button
            variant={filterStatus === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('pending')}
          >
            Pendentes
          </Button>
          <Button
            variant={filterStatus === 'sent' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('sent')}
          >
            Enviados
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Data Compra</TableHead>
              <TableHead>Email Enviado</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Carregando leads...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : leads && leads.length > 0 ? (
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.id}</TableCell>
                  <TableCell>{lead.nome}</TableCell>
                  <TableCell className="font-mono text-sm">{lead.email}</TableCell>
                  <TableCell>{lead.produto || "-"}</TableCell>
                  <TableCell>{lead.plano || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(lead.valor)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(lead.dataAprovacao)}
                  </TableCell>
                  <TableCell>
                    {lead.emailEnviado === 1 ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Enviado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex gap-2 justify-center">
                      {lead.emailEnviado === 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => sendEmailToLead.mutate({ leadId: lead.id })}
                          disabled={sendEmailToLead.isPending}
                          className="gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          Enviar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleToggleEmailStatus(lead.id, lead.emailEnviado)
                        }
                        disabled={updateEmailStatus.isPending}
                      >
                        {lead.emailEnviado === 1
                          ? "Marcar Pendente"
                          : "Marcar Enviado"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <p className="text-muted-foreground">
                    {debouncedSearchTerm
                      ? `Nenhum lead encontrado para "${debouncedSearchTerm}"`
                      : "Nenhum lead encontrado"}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {leadsData && leadsData.total > 0 ? (
            <>
              Exibindo <span className="font-semibold">{leads.length}</span> de{" "}
              <span className="font-semibold">{leadsData.total}</span> leads
              {debouncedSearchTerm && ` (filtrados por busca)`}
            </>
          ) : (
            <>
              Total de leads: <span className="font-semibold">0</span>
            </>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
