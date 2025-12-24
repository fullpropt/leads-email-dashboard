import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
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
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FilterStatus = 'all' | 'active' | 'abandoned';

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  const { data: leadsData, isLoading, refetch } = trpc.leads.listPaginated.useQuery(
    { 
      page: currentPage, 
      status: filterStatus,
      search: debouncedSearchTerm
    },
    {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    }
  );

  const leads = leadsData?.leads || [];

  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
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
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Data de Criação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Carregando leads...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : leads && leads.length > 0 ? (
              leads.map((lead) => {
                const situation = lead.situacao || 'Ativo';
                const situationColor = situation === 'Carrinho Abandonado' ? 'text-orange-600' : 'text-green-600';
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.id}</TableCell>
                    <TableCell>{lead.nome}</TableCell>
                    <TableCell className="font-mono text-sm">{lead.email}</TableCell>
                    <TableCell className={`text-sm font-medium ${situationColor}`}>
                      {situation}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(lead.dataCriacao)}
                    </TableCell>
                  </TableRow>
                );
              }))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
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
