import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Search, CheckCircle2, XCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FilterStatus = 'all' | 'active' | 'abandoned';
type PlatformAccessFilter = 'all' | 'accessed' | 'not_accessed';
type SortDirection = 'asc' | 'desc';

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [platformAccessFilter, setPlatformAccessFilter] = useState<PlatformAccessFilter>('all');
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  
  // Novo estado para ordenação
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, platformAccessFilter, filterStatus]);

  const { data: leadsData, isLoading, refetch } = trpc.leads.listPaginated.useQuery(
    { 
      page: currentPage, 
      status: 'all',
      search: debouncedSearchTerm,
      leadStatus: filterStatus,
      platformAccess: platformAccessFilter,
      sortDirection: sortDirection, // Novo parâmetro
    },
    {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  const { data: selectedCount = 0, refetch: refetchSelectedCount } = trpc.leads.getSelectedCount.useQuery(
    undefined,
    {
      staleTime: 1000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  const { data: accessStats } = trpc.leads.getAccessStats.useQuery(
    undefined,
    {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  useEffect(() => {
    console.log("🔢 Contador global de leads selecionados:", selectedCount);
  }, [selectedCount]);

  const updateLeadSelection = trpc.leads.updateManualSendSelection.useMutation({
    onSuccess: () => {
      console.log("✅ Lead seleção atualizada com sucesso");
      refetchSelectedCount();
    },
    onError: (error) => {
      console.error("❌ Erro ao atualizar seleção:", error);
      toast.error("Erro ao atualizar seleção do lead");
    },
  });
  
  const updateAllSelection = trpc.leads.updateAllManualSendSelection.useMutation({
    onSuccess: () => {
      console.log("✅ Seleção de todos os leads atualizada com sucesso");
      refetchSelectedCount();
    },
    onError: (error) => {
      console.error("❌ Erro ao atualizar seleção de todos:", error);
      toast.error("Erro ao atualizar seleção dos leads");
    },
  });

  const syncWithTubetools = trpc.tubetools.syncAll.useMutation({
    onSuccess: (data) => {
      console.log("✅ Sincronização com TubeTools concluída:", data);
      toast.success(`Sincronização concluída: ${data.accessed} acessaram, ${data.notAccessed} não acessaram`);
      refetch();
    },
    onError: (error) => {
      console.error("❌ Erro ao sincronizar com TubeTools:", error);
      toast.error("Erro ao sincronizar com TubeTools");
    },
  });

  const isSyncing = syncWithTubetools.isPending;
  const leads = leadsData?.leads || [];

  useEffect(() => {
    if (leads && leads.length > 0) {
      const selectedSet = new Set<number>();
      leads.forEach((lead) => {
        if (lead.selectedForManualSend === 1) {
          selectedSet.add(lead.id);
        }
      });
      setSelectedLeads(selectedSet);
      console.log("📋 Estado inicial carregado:", selectedSet);
    }
  }, [leads]);

  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const handlePlatformAccessFilterChange = (filter: PlatformAccessFilter) => {
    setPlatformAccessFilter(filter);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  // Novo: Função para alternar ordenação
  const handleToggleSort = () => {
    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    setCurrentPage(1);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  const handleToggleLead = (leadId: number) => {
    console.log("🔄 Toggle lead:", leadId);
    
    const newSelected = new Set(selectedLeads);
    const isCurrentlySelected = newSelected.has(leadId);
    
    if (isCurrentlySelected) {
      newSelected.delete(leadId);
      console.log("➖ Lead removido da seleção:", leadId);
    } else {
      newSelected.add(leadId);
      console.log("➕ Lead adicionado à seleção:", leadId);
    }
    
    setSelectedLeads(newSelected);
    console.log("📊 Leads selecionados agora:", Array.from(newSelected));
    
    updateLeadSelection.mutate({
      leadId,
      selected: !isCurrentlySelected
    });
  };

  const handleToggleAll = () => {
    const allSelected = selectedLeads.size === leads.length && leads.length > 0;
    console.log("🔄 Toggle all - Todos selecionados?", allSelected);
    
    if (allSelected) {
      setSelectedLeads(new Set());
      console.log("➖ Todos os leads removidos da seleção");
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
      console.log("➕ Todos os leads adicionados à seleção");
    }
    
    updateAllSelection.mutate({
      selected: !allSelected
    });
  };

  const totalPages = leadsData?.totalPages || 1;
  const total = leadsData?.total || 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Cabeçalho com título e botão de sincronização */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie os leads capturados
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncWithTubetools.mutate()}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Atualizar'}
          </Button>
        </div>

        {/* Barra de busca */}
        <div className="flex items-center gap-2">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
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
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </Button>
          )}
        </div>

        {/* Filtros minimalistas em uma única linha */}
        <div className="flex gap-3 items-end flex-wrap">
          {/* Filtro de Status do Lead */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Status do Lead
            </label>
            <Select value={filterStatus} onValueChange={(value) => handleFilterChange(value as FilterStatus)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Acesso à Plataforma */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Acesso à Plataforma
            </label>
            <Select value={platformAccessFilter} onValueChange={(value) => handlePlatformAccessFilterChange(value as PlatformAccessFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todos {accessStats && `(${accessStats.total})`}
                </SelectItem>
                <SelectItem value="accessed">
                  Acessaram {accessStats && `(${accessStats.accessed})`}
                </SelectItem>
                <SelectItem value="not_accessed">
                  Não Acessaram {accessStats && `(${accessStats.notAccessed})`}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Indicador de seleção */}
        {selectedCount > 0 && (
          <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <span className="font-semibold">{selectedCount}</span> lead(s) selecionado(s) para envio
          </div>
        )}
      </div>

      {/* Tabela de Leads */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Coluna de checkbox para selecionar todos */}
              <TableHead className="w-12 cursor-pointer">
                <div onClick={() => handleToggleAll()} className="flex items-center justify-center">
                  <Checkbox 
                    checked={selectedLeads.size === leads.length && leads.length > 0}
                    onCheckedChange={() => handleToggleAll()}
                    title={selectedLeads.size === leads.length && leads.length > 0 ? "Desselecionar todos" : "Selecionar todos"}
                  />
                </div>
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status Plataforma</TableHead>
              <TableHead>Situação</TableHead>
              
              {/* Cabeçalho clicável para ordenação por Data de Criação */}
              <TableHead 
                className="cursor-pointer hover:bg-muted transition-colors"
                onClick={handleToggleSort}
                title="Clique para ordenar por data"
              >
                <div className="flex items-center gap-2">
                  <span>Data de Criação</span>
                  {sortDirection === 'desc' ? (
                    <ArrowDown className="h-4 w-4 text-primary" />
                  ) : (
                    <ArrowUp className="h-4 w-4 text-primary" />
                  )}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Carregando leads...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : leads && leads.length > 0 ? (
              leads.map((lead) => {
                const situation = lead.status === 'abandoned' ? 'Carrinho Abandonado' : 'Ativo';
                const situationColor = lead.status === 'abandoned' ? 'text-orange-600' : 'text-green-600';
                const hasAccessed = lead.hasAccessedPlatform === 1;
                
                return (
                  <TableRow key={lead.id}>
                    {/* Checkbox individual para cada lead */}
                    <TableCell className="cursor-pointer" onClick={() => handleToggleLead(lead.id)}>
                      <div className="flex items-center justify-center">
                        <Checkbox 
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => handleToggleLead(lead.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{lead.id}</TableCell>
                    <TableCell>{lead.nome}</TableCell>
                    <TableCell className="font-mono text-sm">{lead.email}</TableCell>
                    
                    {/* Status da plataforma com badge */}
                    <TableCell>
                      {hasAccessed ? (
                        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300">
                          <XCircle className="h-3 w-3" />
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell className={`text-sm font-medium ${situationColor}`}>
                      {situation}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(lead.dataCriacao)}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <p className="text-muted-foreground">
                    {debouncedSearchTerm
                      ? `Nenhum lead encontrado para "${debouncedSearchTerm}"`
                      : platformAccessFilter === 'accessed'
                      ? "Nenhum lead acessou a plataforma ainda"
                      : platformAccessFilter === 'not_accessed'
                      ? "Todos os leads já acessaram a plataforma"
                      : "Nenhum lead encontrado"}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {leadsData && leadsData.total > 0 ? (
            <>
              Exibindo <span className="font-semibold">{leads.length}</span> de{" "}
              <span className="font-semibold">{leadsData.total}</span> leads
              {debouncedSearchTerm && ` (filtrados por busca)`}
              {platformAccessFilter !== 'all' && ` (filtrados por acesso)`}
            </>
          ) : (
            <>
              Total de leads: <span className="font-semibold">0</span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-2 px-4">
            <span className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
