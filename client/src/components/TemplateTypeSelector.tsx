import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingBag, UserPlus, Clock, ShoppingCart } from "lucide-react";

interface TemplateTypeSelectorProps {
  open: boolean;
  onSelect: (type: "compra_aprovada" | "novo_cadastro" | "programado" | "carrinho_abandonado") => void;
  onOpenChange: (open: boolean) => void;
}

const templateTypes = [
  {
    id: "compra_aprovada",
    label: "Compra Aprovada",
    description: "Email enviado quando um cliente faz uma compra",
    icon: ShoppingBag,
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    borderColor: "border-green-200 dark:border-green-800",
  },
  {
    id: "novo_cadastro",
    label: "Novo Cadastro",
    description: "Email enviado quando um novo usuário se cadastra",
    icon: UserPlus,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  {
    id: "programado",
    label: "Programado",
    description: "Email agendado X dias após o lead ser criado",
    icon: Clock,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  {
    id: "carrinho_abandonado",
    label: "Carrinho Abandonado",
    description: "Email para clientes que abandonaram o carrinho",
    icon: ShoppingCart,
    color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
];

export function TemplateTypeSelector({
  open,
  onSelect,
  onOpenChange,
}: TemplateTypeSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Selecione o tipo de template</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {templateTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Button
                key={type.id}
                variant="outline"
                className={`h-auto flex flex-col items-start p-4 justify-start border-2 ${type.borderColor} hover:bg-muted transition-colors`}
                onClick={() => {
                  onSelect(type.id as any);
                  onOpenChange(false);
                }}
              >
                <div className={`p-2 rounded-lg mb-2 ${type.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
