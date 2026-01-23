import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface FunnelConfig {
  nome: string;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface FunnelTemplateConfig {
  delayValue: number;
  delayUnit: "hours" | "days" | "weeks";
  sendTime?: string;
}

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTemplate: (config: TemplateConfig) => void;
  onCreateFunnel: (config: FunnelConfig) => void;
  onCreateFunnelTemplate?: (config: FunnelTemplateConfig) => void;
  isFunnelContext?: boolean; // Se está dentro de um funil
}

export function CreateItemModal({
  isOpen,
  onClose,
  onCreateTemplate,
  onCreateFunnel,
  onCreateFunnelTemplate,
  isFunnelContext = false,
}: CreateItemModalProps) {
  const [activeTab, setActiveTab] = useState<"template" | "funnel">("template");
  const [statusPlataforma, setStatusPlataforma] = useState<"all" | "accessed" | "not_accessed">("all");
  const [situacao, setSituacao] = useState<"all" | "active" | "abandoned">("all");
  const [funnelNome, setFunnelNome] = useState("Novo Funil");

  // Para templates dentro de funil
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days" | "weeks">("days");
  const [sendTime, setSendTime] = useState("");

  const resetForm = () => {
    setActiveTab("template");
    setStatusPlataforma("all");
    setSituacao("all");
    setFunnelNome("Novo Funil");
    setDelayValue(0);
    setDelayUnit("days");
    setSendTime("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = () => {
    if (isFunnelContext) {
      // Criar template dentro do funil
      onCreateFunnelTemplate?.({
        delayValue,
        delayUnit,
        sendTime: sendTime || undefined,
      });
    } else if (activeTab === "template") {
      onCreateTemplate({
        targetStatusPlataforma: statusPlataforma,
        targetSituacao: situacao,
      });
    } else {
      onCreateFunnel({
        nome: funnelNome,
        targetStatusPlataforma: statusPlataforma,
        targetSituacao: situacao,
      });
    }
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isFunnelContext ? "Novo Template" : "Criar Novo Item"}
          </DialogTitle>
        </DialogHeader>

        {!isFunnelContext && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "template" | "funnel")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="template">Novo Template</TabsTrigger>
              <TabsTrigger value="funnel">Novo Funil</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-4 mt-4">
          {isFunnelContext ? (
            // Configuração para template dentro do funil
            <>
              <p className="text-sm font-medium text-foreground">
                Defina quando será enviado o email
              </p>
              <p className="text-xs text-muted-foreground">
                Escolha em quanto tempo será enviado após o último Template.
              </p>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs">Delay</Label>
                  <Input
                    type="number"
                    min={0}
                    value={delayValue}
                    onChange={(e) => setDelayValue(Number(e.target.value))}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as "hours" | "days" | "weeks")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Dias</SelectItem>
                      <SelectItem value="weeks">Semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Horário (UTC)</Label>
                  <Input
                    type="time"
                    value={sendTime}
                    onChange={(e) => setSendTime(e.target.value)}
                    placeholder="--:--"
                    disabled={delayUnit === "hours"}
                  />
                </div>
              </div>
            </>
          ) : (
            // Configuração para template/funil na página principal
            <>
              <p className="text-sm text-muted-foreground">
                Selecione os filtros de destinatários
              </p>

              {activeTab === "funnel" && (
                <div className="space-y-2">
                  <Label className="text-xs">Nome do Funil</Label>
                  <Input
                    value={funnelNome}
                    onChange={(e) => setFunnelNome(e.target.value)}
                    placeholder="Nome do Funil"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Status Plataforma</Label>
                  <Select value={statusPlataforma} onValueChange={(v) => setStatusPlataforma(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="accessed">Acessou</SelectItem>
                      <SelectItem value="not_accessed">Não Acessou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Situação</Label>
                  <Select value={situacao} onValueChange={(v) => setSituacao(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Compra Aprovada</SelectItem>
                      <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate}>
            Criar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
