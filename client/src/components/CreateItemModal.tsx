import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface FunnelConfig {
  nome: string;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned";
}

interface TransmissionConfig {
  name: string;
  mode: "immediate" | "scheduled";
  scheduledAt?: string;
  sendIntervalSeconds: number;
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendOrder: "newest_first" | "oldest_first";
}

interface FunnelTemplateConfig {
  delayValue: number;
  delayUnit: "minutes" | "hours" | "days" | "weeks";
  sendTime?: string;
}

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTemplate: (config: TemplateConfig) => void;
  onCreateFunnel: (config: FunnelConfig) => void;
  onCreateTransmission?: (config: TransmissionConfig) => void;
  onCreateFunnelTemplate?: (config: FunnelTemplateConfig) => void;
  isFunnelContext?: boolean;
}

export function CreateItemModal({
  isOpen,
  onClose,
  onCreateTemplate,
  onCreateFunnel,
  onCreateTransmission,
  onCreateFunnelTemplate,
  isFunnelContext = false,
}: CreateItemModalProps) {
  const [activeTab, setActiveTab] = useState<"template" | "funnel" | "transmission">("template");
  const [statusPlataforma, setStatusPlataforma] = useState<"all" | "accessed" | "not_accessed">("all");
  const [situacao, setSituacao] = useState<"all" | "active" | "abandoned">("all");
  const [funnelNome, setFunnelNome] = useState("Novo Funil");

  const [transmissionName, setTransmissionName] = useState("Nova Transmissao");
  const [transmissionMode, setTransmissionMode] = useState<"immediate" | "scheduled">("immediate");
  const [transmissionScheduledAt, setTransmissionScheduledAt] = useState("");
  const [transmissionIntervalSeconds, setTransmissionIntervalSeconds] = useState(0);
  const [transmissionSituacao, setTransmissionSituacao] = useState<
    "all" | "active" | "abandoned" | "none"
  >("all");
  const [transmissionSendOrder, setTransmissionSendOrder] = useState<
    "newest_first" | "oldest_first"
  >("newest_first");

  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<"minutes" | "hours" | "days" | "weeks">("days");
  const [sendTime, setSendTime] = useState("");

  const resetForm = () => {
    setActiveTab("template");
    setStatusPlataforma("all");
    setSituacao("all");
    setFunnelNome("Novo Funil");
    setTransmissionName("Nova Transmissao");
    setTransmissionMode("immediate");
    setTransmissionScheduledAt("");
    setTransmissionIntervalSeconds(0);
    setTransmissionSituacao("all");
    setTransmissionSendOrder("newest_first");
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
      onCreateFunnelTemplate?.({
        delayValue,
        delayUnit,
        sendTime: sendTime || undefined,
      });
      handleClose();
      return;
    }

    if (activeTab === "template") {
      onCreateTemplate({
        targetStatusPlataforma: statusPlataforma,
        targetSituacao: situacao,
      });
      handleClose();
      return;
    }

    if (activeTab === "funnel") {
      onCreateFunnel({
        nome: funnelNome,
        targetStatusPlataforma: statusPlataforma,
        targetSituacao: situacao,
      });
      handleClose();
      return;
    }

    onCreateTransmission?.({
      name: transmissionName,
      mode: transmissionMode,
      scheduledAt: transmissionMode === "scheduled" ? transmissionScheduledAt : undefined,
      sendIntervalSeconds: Math.max(0, transmissionIntervalSeconds),
      targetStatusPlataforma: statusPlataforma,
      targetSituacao: transmissionSituacao,
      sendOrder: transmissionSendOrder,
    });
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isFunnelContext ? "Novo Template" : "Criar Novo Item"}</DialogTitle>
        </DialogHeader>

        {!isFunnelContext && (
          <Tabs
            value={activeTab}
            onValueChange={value =>
              setActiveTab(value as "template" | "funnel" | "transmission")
            }
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="template">Template</TabsTrigger>
              <TabsTrigger value="funnel">Funil</TabsTrigger>
              <TabsTrigger value="transmission">Transmissao</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-4 mt-4">
          {isFunnelContext ? (
            <>
              <p className="text-sm font-medium text-foreground">Defina quando o template sera enviado</p>
              <p className="text-xs text-muted-foreground">
                Escolha em quanto tempo sera enviado apos o template anterior.
              </p>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs">Delay</Label>
                  <Input
                    type="number"
                    min={0}
                    value={delayValue}
                    onChange={event => setDelayValue(Number(event.target.value))}
                  />
                </div>

                <div className="flex-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select
                    value={delayUnit}
                    onValueChange={value =>
                      setDelayUnit(value as "minutes" | "hours" | "days" | "weeks")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutos</SelectItem>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Dias</SelectItem>
                      <SelectItem value="weeks">Semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1">
                  <Label className="text-xs">Horario (UTC)</Label>
                  <Input
                    type="time"
                    value={sendTime}
                    onChange={event => setSendTime(event.target.value)}
                    placeholder="--:--"
                    disabled={delayUnit === "hours" || delayUnit === "minutes"}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {activeTab === "funnel" && (
                <div className="space-y-2">
                  <Label className="text-xs">Nome do Funil</Label>
                  <Input
                    value={funnelNome}
                    onChange={event => setFunnelNome(event.target.value)}
                    placeholder="Nome do Funil"
                  />
                </div>
              )}

              {activeTab === "transmission" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs">Nome da Transmissao</Label>
                    <Input
                      value={transmissionName}
                      onChange={event => setTransmissionName(event.target.value)}
                      placeholder="Nome da Transmissao"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Modo de envio</Label>
                      <Select
                        value={transmissionMode}
                        onValueChange={value =>
                          setTransmissionMode(value as "immediate" | "scheduled")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Imediato</SelectItem>
                          <SelectItem value="scheduled">Agendado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Intervalo (segundos)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={3600}
                        value={transmissionIntervalSeconds}
                        onChange={event =>
                          setTransmissionIntervalSeconds(
                            Number.isNaN(Number(event.target.value))
                              ? 0
                              : Number(event.target.value)
                          )
                        }
                      />
                    </div>
                  </div>

                  {transmissionMode === "scheduled" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Data e hora do agendamento</Label>
                      <Input
                        type="datetime-local"
                        value={transmissionScheduledAt}
                        onChange={event => setTransmissionScheduledAt(event.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Prioridade de envio</Label>
                    <Select
                      value={transmissionSendOrder}
                      onValueChange={value =>
                        setTransmissionSendOrder(value as "newest_first" | "oldest_first")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest_first">Leads mais novos primeiro</SelectItem>
                        <SelectItem value="oldest_first">Leads mais antigos primeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Status Plataforma</Label>
                  <Select
                    value={statusPlataforma}
                    onValueChange={value =>
                      setStatusPlataforma(value as "all" | "accessed" | "not_accessed")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="accessed">Ativo</SelectItem>
                      <SelectItem value="not_accessed">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Situacao</Label>
                  <Select
                    value={activeTab === "transmission" ? transmissionSituacao : situacao}
                    onValueChange={value => {
                      if (activeTab === "transmission") {
                        setTransmissionSituacao(
                          value as "all" | "active" | "abandoned" | "none"
                        );
                      } else {
                        setSituacao(value as "all" | "active" | "abandoned");
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Compra Aprovada</SelectItem>
                      <SelectItem value="abandoned">Carrinho Abandonado</SelectItem>
                      {activeTab === "transmission" && (
                        <SelectItem value="none">Nenhum</SelectItem>
                      )}
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
          <Button onClick={handleCreate}>Criar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
