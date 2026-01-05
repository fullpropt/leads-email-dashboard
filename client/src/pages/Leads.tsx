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
import { Loader2, RefreshCw, Search, CheckCircle2, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
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
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [importingToken, setImportingToken] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, platformAccessFilter, filterStatus, sortDirection]);

  const { data: leadsData, isLoading, refetch } = trpc.leads.listPaginated.useQuery(
    { 
      page: currentPage, 
      status: 'all',
      search: debouncedSearchTerm,
      leadStatus: filterStatus,
      platformAccess: platformAccessFilter,
      sortDirection: sortDirection,
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

  const importAbandonedCarts = trpc.leads.importAbandonedCarts.useMutation({
    onSuccess: (data) => {
      console.log("✅ Importação concluída:", data);
      toast.success(data.message);
      refetch();
      setImportingToken(false);
    },
    onError: (error) => {
      console.error("❌ Erro ao importar:", error);
      toast.error("Erro ao importar carrinhos abandonados");
      setImportingToken(false);
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

  const handleSortByDate = () => {
    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
  };

  const handleImportHistorical = () => {
    const token = prompt("Cole seu token de acesso da API PerfectPay:");
    if (token && token.trim()) {
      setImportingToken(true);
      importAbandonedCarts.mutate({
        token: token.trim(),
        daysBack: 7
      });
    }
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie os leads capturados
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportHistorical}
              disabled={importingToken}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {importingToken ? 'Importando...' : 'Importar Histórico'}
            </Button>
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
        </div>

        <div className="flex items-center gap-4">
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
            >
              Limpar
            </Button>
          )}
        </div>

        <div className="flex gap-4 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status do Lead</label>
            <Select value={filterStatus} onValueChange={(value) => handleFilterChange(value as FilterStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Acesso à Plataforma</label>
            <Select value={platformAccessFilter} onValueChange={(value) => handlePlatformAccessFilterChange(value as PlatformAccessFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos {accessStats && `(${accessStats.total})`}</SelectItem>
                <SelectItem value="accessed">Acessaram {accessStats && `(${accessStats.accessed})`}</SelectItem>
                <SelectItem value="not_accessed">Não Acessaram {accessStats && `(${accessStats.notAccessed})`}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <span className="font-semibold">{selectedCount}</span> lead(s) selecionado(s) para envio
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedLeads.size === leads.length && leads.length > 0}
                  onCheckedChange={handleToggleAll}
                />
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status Plataforma</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={handleSortByDate}>
                <div className="flex items-center gap-2">
                  Data de Criação
                  {sortDirection === 'desc' ? (
                    <ArrowDown className="h-4 w-4" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Carregando leads...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <p>Nenhum lead encontrado</p>
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLeads.has(lead.id)}
                      onCheckedChange={() => handleToggleLead(lead.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.id}</TableCell>
                  <TableCell>{lead.name}</TableCell>
                  <TableCell className="text-sm">{lead.email}</TableCell>
                  <TableCell>
                    {lead.hasAccessedPlatform === 1 ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {lead.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(lead.createdAt)}
                  </TableCell>
                </TableRow>
              ))
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
