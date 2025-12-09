import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
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
import { CheckCircle2, XCircle, Loader2, RefreshCw, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: leads, isLoading, refetch } = trpc.leads.list.useQuery(undefined, {
    refetchInterval: 5000, // Atualizar a cada 5 segundos
  });

  // Filtrar leads baseado no termo de busca
  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    if (!searchTerm.trim()) return leads;

    const term = searchTerm.toLowerCase();
    return leads.filter(
      (lead) =>
        lead.nome.toLowerCase().includes(term) ||
        lead.email.toLowerCase().includes(term)
    );
  }, [leads, searchTerm]);

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

  const handleToggleEmailStatus = (leadId: number, currentStatus: number) => {
    updateEmailStatus.mutate({
      leadId,
      enviado: currentStatus === 0,
    });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <RefreshCw className="h-4 w-4" />
            Atualizar
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
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
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
            {filteredLeads && filteredLeads.length > 0 ? (
              filteredLeads.map((lead) => (
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
                    {searchTerm
                      ? "Nenhum lead encontrado com esse termo de busca"
                      : "Nenhum lead encontrado"}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {leads && leads.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {searchTerm ? (
            <>
              Exibindo <span className="font-semibold">{filteredLeads.length}</span> de{" "}
              <span className="font-semibold">{leads.length}</span> leads
            </>
          ) : (
            <>
              Total de leads: <span className="font-semibold">{leads.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
