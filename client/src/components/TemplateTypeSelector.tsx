import React, { useState } from "react";
import { X } from "lucide-react";

interface TemplateType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

interface TemplateTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const TEMPLATE_TYPES: TemplateType[] = [
  {
    id: "compra_aprovada",
    label: "Compra Aprovada",
    description: "Email enviado quando um cliente faz uma compra",
    icon: "🛍️",
    color: "bg-green-50 border-green-200 hover:border-green-400",
  },
  {
    id: "novo_cadastro",
    label: "Novo Cadastro",
    description: "Email enviado quando um novo usuário se cadastra",
    icon: "👤",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
  },
  {
    id: "programado",
    label: "Programado",
    description: "Email agendado X dias após criação do lead",
    icon: "⏰",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400",
  },
  {
    id: "carrinho_abandonado",
    label: "Carrinho Abandonado",
    description: "Email para clientes que abandonaram o carrinho",
    icon: "🛒",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
  },
];

export function TemplateTypeSelector({
  isOpen,
  onClose,
  onSelect,
}: TemplateTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleSelect = (typeId: string) => {
    setSelectedType(typeId);
    onSelect(typeId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Selecione o tipo de template
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fechar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEMPLATE_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => handleSelect(type.id)}
                className={`
                  p-5 rounded-lg border-2 transition-all duration-200
                  text-left cursor-pointer
                  ${type.color}
                  hover:shadow-md active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                `}
              >
                {/* Icon */}
                <div className="text-3xl mb-3">{type.icon}</div>

                {/* Label */}
                <h3 className="font-semibold text-gray-900 text-base mb-2">
                  {type.label}
                </h3>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {type.description}
                </p>
              </button>
            ))}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Dica:</strong> Escolha o tipo de template que melhor se
              adequa ao seu objetivo de email marketing. Cada tipo possui
              configurações específicas para maximizar o engajamento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
