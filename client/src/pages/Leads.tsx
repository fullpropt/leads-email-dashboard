import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Search, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FilterStatus = 'all' | 'active' | 'abandoned';
type PlatformAccessFilter = 'all' | 'accessed' | 'not_accessed';

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [platformAccessFilter, setPlatformAccessFilter] = useState<PlatformAccessFilter>('all');
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, platformAccessFilter]);

  const { data: leadsData, isLoading, refetch } = trpc.leads.listPaginated.useQuery(
    { 
      page: currentPage, 
      status: 'all', // status de email (pending/sent/all)
      search: debouncedSearchTerm,
      leadStatus: filterStatus, // status de lead (active/abandoned/all)
      platformAccess: platformAccessFilter // NOVO: filtro de acesso à plataforma
    },
    {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  // Query para buscar contador global de leads selecionados
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

  // Debug: Log do contador global
  useEffect(() => {
    console.log("🔢 Contador global de leads selecionados:", selectedCount);
  }, [selectedCount]);

  // Mutations para gerenciar seleção de leads
  const updateLeadSelection = trpc.leads.updateManualSendSelection.useMutation({
    onSuccess: () => {
      console.log("✅ Lead seleção atualizada com sucesso");
      refetchSelectedCount(); // Atualizar contador global
    },
    onError: (error) => {
      console.error("❌ Erro ao atualizar seleção:", error);
      toast.error("Erro ao atualizar seleção do lead");
    },
  });
  
  const updateAllSelection = trpc.leads.updateAllManualSendSelection.useMutation({
    onSuccess: () => {
      console.log("✅ Seleção de todos os leads atualizada com sucesso");
      refetchSelectedCount(); // Atualizar contador global
    },
    onError: (error) => {
      console.error("❌ Erro ao atualizar seleção de todos:", error);
      toast.error("Erro ao atualizar seleção dos leads");
    },
  });

  const leads = leadsData?.leads || [];

  // Carregar o estado inicial de seleção do banco de dados
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

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  // Função para toggle individual de lead
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
    
    // Atualizar no banco de dados
    updateLeadSelection.mutate({
      leadId,
      selected: !isCurrentlySelected
    });
  };

  // Função para toggle de todos os leads (seleciona/deseleciona)
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
    
    // Atualizar no banco de dados
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
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

        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('all')}
          >
            Todos
          </Button>
          <Button
            variant={filterStatus === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('active')}
          >
            Ativo
          </Button>
          <Button
            variant={filterStatus === 'abandoned' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilterChange('abandoned')}
          >
            Carrinho Abandonado
          </Button>
        </div>

        {/* NOVO: Filtros de acesso à plataforma */}
        <div className="flex gap-2 border-t pt-4">
          <span className="text-sm font-medium text-muted-foreground mr-2 flex items-center">
            Acesso à Plataforma:
          </span>
          <Button
            variant={platformAccessFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePlatformAccessFilterChange('all')}
          >
            Todos
          </Button>
          <Button
            variant={platformAccessFilter === 'accessed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePlatformAccessFilterChange('accessed')}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Acessaram
          </Button>
          <Button
            variant={platformAccessFilter === 'not_accessed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePlatformAccessFilterChange('not_accessed')}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            Não Acessaram
          </Button>
        </div>

        {/* Indicador de seleção */}
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
              <TableHead>Data de Criação</TableHead>
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
                
                // NOVO: Badge de acesso à plataforma
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
                    
                    {/* NOVO: Coluna de status da plataforma com badge */}
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
