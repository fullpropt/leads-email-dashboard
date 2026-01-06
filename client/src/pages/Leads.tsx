import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
import { Loader2, RefreshCw, Search, CheckCircle2, XCircle, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FilterStatus = 'all' | 'active' | 'abandoned' | 'none';
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
  
  // Estados para os dropdowns nos cabeçalhos
  const [showSituacaoDropdown, setShowSituacaoDropdown] = useState(false);
  const [showStatusPlataformaDropdown, setShowStatusPlataformaDropdown] = useState(false);
  
  // Refs para detectar cliques fora dos dropdowns
  const situacaoDropdownRef = useRef<HTMLTableCellElement>(null);
  const statusPlataformaDropdownRef = useRef<HTMLTableCellElement>(null);
  const situacaoMenuRef = useRef<HTMLDivElement>(null);
  const statusPlataformaMenuRef = useRef<HTMLDivElement>(null);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Verificar se o clique foi dentro do cabeçalho ou menu de Situação
      const isInsideSituacao = 
        (situacaoDropdownRef.current && situacaoDropdownRef.current.contains(target)) ||
        (situacaoMenuRef.current && situacaoMenuRef.current.contains(target));
      
      // Verificar se o clique foi dentro do cabeçalho ou menu de Status Plataforma
      const isInsideStatusPlataforma = 
        (statusPlataformaDropdownRef.current && statusPlataformaDropdownRef.current.contains(target)) ||
        (statusPlataformaMenuRef.current && statusPlataformaMenuRef.current.contains(target));
      
      if (!isInsideSituacao && showSituacaoDropdown) {
        setShowSituacaoDropdown(false);
      }
      if (!isInsideStatusPlataforma && showStatusPlataformaDropdown) {
        setShowStatusPlataformaDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSituacaoDropdown, showStatusPlataformaDropdown]);

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
      refetch(); // Recarregar a lista para atualizar o estado visual dos checkboxes
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
    setShowSituacaoDropdown(false);
  };

  const handlePlatformAccessFilterChange = (filter: PlatformAccessFilter) => {
    setPlatformAccessFilter(filter);
    setCurrentPage(1);
    setShowStatusPlataformaDropdown(false);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleSortByDate = () => {
    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
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
    console.log("🔍 Filtros ativos - leadStatus:", filterStatus, "platformAccess:", platformAccessFilter, "search:", debouncedSearchTerm);
    
    if (allSelected) {
      setSelectedLeads(new Set());
      console.log("➖ Todos os leads removidos da seleção");
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
      console.log("➕ Todos os leads adicionados à seleção");
    }
    
    // Passar os filtros atuais para o backend para que a seleção respeite os filtros
    updateAllSelection.mutate({
      selected: !allSelected,
      leadStatus: filterStatus,
      platformAccess: platformAccessFilter,
      search: debouncedSearchTerm || undefined
    });
  };

  // Função para obter o label da situação baseado em lead_type
  const getSituacaoLabel = (leadType: string) => {
    switch (leadType) {
      case 'compra_aprovada': return 'Compra Aprovada';
      case 'carrinho_abandonado': return 'Carrinho Abandonado';
      default: return 'Nenhum'; // leads migrados (lead, novo_cadastro)
    }
  };

  // Função para obter o label do filtro de situação atual
  const getSituacaoFilterLabel = () => {
    switch (filterStatus) {
      case 'active': return 'Compra Aprovada';
      case 'abandoned': return 'Carrinho Abandonado';
      case 'none': return 'Nenhum';
      default: return 'Situação';
    }
  };

  // Função para obter o label do filtro de status plataforma atual
  const getStatusPlataformaFilterLabel = () => {
    switch (platformAccessFilter) {
      case 'accessed': return 'Ativo';
      case 'not_accessed': return 'Inativo';
      default: return 'Status Plataforma';
    }
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

        {/* Contador total de leads */}
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium bg-muted px-4 py-2 rounded-lg">
            Total de Leads: <span className="font-bold text-primary">{total}</span>
            {(filterStatus !== 'all' || platformAccessFilter !== 'all' || debouncedSearchTerm) && (
              <span className="text-muted-foreground ml-2">(filtrados)</span>
            )}
          </div>
          {(filterStatus !== 'all' || platformAccessFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterStatus('all');
                setPlatformAccessFilter('all');
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <span className="font-semibold">{selectedCount}</span> lead(s) selecionado(s) para envio
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-visible">
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
              
              {/* Status Plataforma com Dropdown */}
              <TableHead className="relative" ref={statusPlataformaDropdownRef}>
                <div 
                  className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => {
                    setShowStatusPlataformaDropdown(!showStatusPlataformaDropdown);
                    setShowSituacaoDropdown(false);
                  }}
                >
                  {getStatusPlataformaFilterLabel()}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showStatusPlataformaDropdown ? 'rotate-180' : ''}`} />
                  {platformAccessFilter !== 'all' && (
                    <span className="ml-1 w-2 h-2 bg-primary rounded-full"></span>
                  )}
                </div>
                {showStatusPlataformaDropdown && statusPlataformaDropdownRef.current && createPortal(
                  <div 
                    ref={statusPlataformaMenuRef}
                    className="bg-popover border rounded-md shadow-lg min-w-[160px] fixed"
                    style={{ 
                      zIndex: 9999,
                      top: statusPlataformaDropdownRef.current.getBoundingClientRect().bottom + 4,
                      left: statusPlataformaDropdownRef.current.getBoundingClientRect().left
                    }}
                  >
                    <div className="py-1">
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${platformAccessFilter === 'all' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handlePlatformAccessFilterChange('all')}
                      >
                        Todos {accessStats && `(${accessStats.total})`}
                      </button>
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${platformAccessFilter === 'accessed' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handlePlatformAccessFilterChange('accessed')}
                      >
                        Ativo {accessStats && `(${accessStats.accessed})`}
                      </button>
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${platformAccessFilter === 'not_accessed' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handlePlatformAccessFilterChange('not_accessed')}
                      >
                        Inativo {accessStats && `(${accessStats.notAccessed})`}
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
              </TableHead>
              
              {/* Situação com Dropdown */}
              <TableHead className="relative" ref={situacaoDropdownRef}>
                <div 
                  className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => {
                    setShowSituacaoDropdown(!showSituacaoDropdown);
                    setShowStatusPlataformaDropdown(false);
                  }}
                >
                  {getSituacaoFilterLabel()}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSituacaoDropdown ? 'rotate-180' : ''}`} />
                  {filterStatus !== 'all' && (
                    <span className="ml-1 w-2 h-2 bg-primary rounded-full"></span>
                  )}
                </div>
                {showSituacaoDropdown && situacaoDropdownRef.current && createPortal(
                  <div 
                    ref={situacaoMenuRef}
                    className="bg-popover border rounded-md shadow-lg min-w-[180px] fixed"
                    style={{ 
                      zIndex: 9999,
                      top: situacaoDropdownRef.current.getBoundingClientRect().bottom + 4,
                      left: situacaoDropdownRef.current.getBoundingClientRect().left
                    }}
                  >
                    <div className="py-1">
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${filterStatus === 'all' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handleFilterChange('all')}
                      >
                        Todos
                      </button>
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${filterStatus === 'active' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handleFilterChange('active')}
                      >
                        Compra Aprovada
                      </button>
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${filterStatus === 'abandoned' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handleFilterChange('abandoned')}
                      >
                        Carrinho Abandonado
                      </button>
                      <button
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors ${filterStatus === 'none' ? 'bg-muted font-medium' : ''}`}
                        onClick={() => handleFilterChange('none')}
                      >
                        Nenhum
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
              </TableHead>
              
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
                  <TableCell>{lead.nome}</TableCell>
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
                    <Badge 
                      variant="secondary"
                      className={lead.leadType === 'compra_aprovada' ? 'bg-blue-100 text-blue-800' : lead.leadType === 'carrinho_abandonado' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}
                    >
                      {getSituacaoLabel(lead.leadType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(lead.dataCriacao)}
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
              {filterStatus !== 'all' && ` (filtrados por situação)`}
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
