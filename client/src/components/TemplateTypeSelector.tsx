import React, { useState } from "react";
import { X, Check, ChevronDown } from "lucide-react";

interface TemplateConfig {
  targetStatusPlataforma: "all" | "accessed" | "not_accessed";
  targetSituacao: "all" | "active" | "abandoned" | "none";
  sendMode: "automatic" | "scheduled" | "manual";
}

interface TemplateTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (config: TemplateConfig) => void;
}

const STATUS_PLATAFORMA_OPTIONS = [
  { value: "all", label: "Todos", description: "Todos os leads" },
  { value: "accessed", label: "Ativo", description: "Leads que acessaram a plataforma" },
  { value: "not_accessed", label: "Inativo", description: "Leads que não acessaram a plataforma" },
];

const SITUACAO_OPTIONS = [
  { value: "all", label: "Todos", description: "Todas as situações" },
  { value: "active", label: "Compra Aprovada", description: "Leads com compra aprovada" },
  { value: "abandoned", label: "Carrinho Abandonado", description: "Leads com carrinho abandonado" },
  { value: "none", label: "Nenhum", description: "Leads sem situação definida (migrados)" },
];

const SEND_MODE_OPTIONS = [
  { 
    value: "automatic", 
    label: "Automático", 
    description: "Enviado automaticamente assim que o lead é criado",
    icon: "⚡",
    color: "bg-green-50 border-green-200 hover:border-green-400"
  },
  { 
    value: "scheduled", 
    label: "Programado", 
    description: "Enviado em horários e intervalos específicos",
    icon: "⏰",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400"
  },
  { 
    value: "manual", 
    label: "Normal", 
    description: "Enviado apenas ao clicar em 'Enviar Selecionados' ou 'Enviar Todos'",
    icon: "✉️",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400"
  },
];

export function TemplateTypeSelector({
  isOpen,
  onClose,
  onSelect,
}: TemplateTypeSelectorProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [config, setConfig] = useState<TemplateConfig>({
    targetStatusPlataforma: "all",
    targetSituacao: "all",
    sendMode: "manual",
  });
  
  const [showStatusPlataformaDropdown, setShowStatusPlataformaDropdown] = useState(false);
  const [showSituacaoDropdown, setShowSituacaoDropdown] = useState(false);

  const handleNext = () => {
    if (step < 3) {
      setStep((step + 1) as 1 | 2 | 3);
    } else {
      onSelect(config);
      handleClose();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3);
    }
  };

  const handleClose = () => {
    setStep(1);
    setConfig({
      targetStatusPlataforma: "all",
      targetSituacao: "all",
      sendMode: "manual",
    });
    onClose();
  };

  const getStatusPlataformaLabel = () => {
    const option = STATUS_PLATAFORMA_OPTIONS.find(o => o.value === config.targetStatusPlataforma);
    return option?.label || "Selecione";
  };

  const getSituacaoLabel = () => {
    const option = SITUACAO_OPTIONS.find(o => o.value === config.targetSituacao);
    return option?.label || "Selecione";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Novo Template de Email
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Passo {step} de 3
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fechar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    s < step
                      ? "bg-green-500 text-white"
                      : s === step
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s < step ? <Check size={16} /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 rounded ${
                      s < step ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Filtros</span>
            <span>Modo de Envio</span>
            <span>Confirmar</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Filtros */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Selecione os filtros de destinatários
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Defina quais leads receberão emails deste template
                </p>
              </div>

              {/* Status Plataforma */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Status Plataforma
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStatusPlataformaDropdown(!showStatusPlataformaDropdown);
                      setShowSituacaoDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left bg-white border border-gray-300 rounded-lg shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
                  >
                    <span>{getStatusPlataformaLabel()}</span>
                    <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showStatusPlataformaDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showStatusPlataformaDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      {STATUS_PLATAFORMA_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setConfig({ ...config, targetStatusPlataforma: option.value as any });
                            setShowStatusPlataformaDropdown(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                            config.targetStatusPlataforma === option.value ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="font-medium text-gray-900">{option.label}</div>
                          <div className="text-sm text-gray-500">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Situação */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Situação
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSituacaoDropdown(!showSituacaoDropdown);
                      setShowStatusPlataformaDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left bg-white border border-gray-300 rounded-lg shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
                  >
                    <span>{getSituacaoLabel()}</span>
                    <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showSituacaoDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showSituacaoDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      {SITUACAO_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setConfig({ ...config, targetSituacao: option.value as any });
                            setShowSituacaoDropdown(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                            config.targetSituacao === option.value ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="font-medium text-gray-900">{option.label}</div>
                          <div className="text-sm text-gray-500">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Modo de Envio */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Selecione o modo de envio
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Defina como os emails serão enviados
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {SEND_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfig({ ...config, sendMode: option.value as any })}
                    className={`
                      p-5 rounded-lg border-2 transition-all duration-200
                      text-left cursor-pointer
                      ${option.color}
                      ${config.sendMode === option.value ? 'ring-2 ring-blue-500 border-blue-500' : ''}
                      hover:shadow-md active:scale-[0.99]
                      focus:outline-none
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{option.icon}</div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {option.label}
                        </h4>
                        <p className="text-gray-600 text-sm leading-relaxed">
                          {option.description}
                        </p>
                      </div>
                      {config.sendMode === option.value && (
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check size={16} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Confirmação */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Confirme as configurações
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Revise as configurações antes de criar o template
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Status Plataforma:</span>
                  <span className="font-medium text-gray-900">{getStatusPlataformaLabel()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Situação:</span>
                  <span className="font-medium text-gray-900">{getSituacaoLabel()}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Modo de Envio:</span>
                  <span className="font-medium text-gray-900">
                    {SEND_MODE_OPTIONS.find(o => o.value === config.sendMode)?.label}
                  </span>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>💡 Dica:</strong> Você poderá editar essas configurações posteriormente 
                  clicando no botão de edição do template.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex justify-between">
          <button
            type="button"
            onClick={step === 1 ? handleClose : handleBack}
            className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {step === 3 ? "Criar Template" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}
