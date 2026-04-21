import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, DollarSign } from "lucide-react";
import { useRegion } from "@/hooks/use-region";

interface StatCardProps {
  title: string;
  value: number;
  type?: "neutral" | "positive" | "negative";
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  type = "neutral", 
  icon,
  description,
  className 
}: StatCardProps) {
  const { formatCurrency } = useRegion();
  const formattedValue = formatCurrency(value);

  return (
    <Card className={cn("overflow-hidden border-l-4 card-hover", className, {
      "border-l-primary": type === "neutral",
      "border-l-green-500": type === "positive",
      "border-l-red-500": type === "negative",
    })}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center bg-muted", {
           "bg-yellow-100 text-yellow-600": type === "neutral",
           "bg-green-100 text-green-600": type === "positive",
           "bg-red-100 text-red-600": type === "negative",
        })}>
          {icon || <DollarSign className="h-4 w-4" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display">{formattedValue}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
