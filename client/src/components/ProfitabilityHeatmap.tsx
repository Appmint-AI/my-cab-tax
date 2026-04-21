import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface HeatmapDay {
  day: string;
  totalEarnings: number;
  tripCount: number;
  averagePerTrip: number;
  tips: number;
}

interface HeatmapData {
  heatmap: HeatmapDay[];
  bestDay: string;
  worstDay: string;
  insight: string;
}

function getBarColor(value: number, max: number): string {
  if (max === 0) return "hsl(var(--muted))";
  const ratio = value / max;
  if (ratio > 0.8) return "#16a34a";
  if (ratio > 0.6) return "#22c55e";
  if (ratio > 0.4) return "#84cc16";
  if (ratio > 0.2) return "#eab308";
  return "#f97316";
}

export function ProfitabilityHeatmap() {
  const { data, isLoading } = useQuery<HeatmapData>({
    queryKey: ["/api/profitability-heatmap"],
  });

  if (isLoading || !data) return null;

  const hasData = data.heatmap.some((d) => d.totalEarnings > 0);
  if (!hasData) return null;

  const maxEarnings = Math.max(...data.heatmap.map((d) => d.totalEarnings));
  const shortDays = data.heatmap.map((d) => ({ ...d, shortDay: d.day.substring(0, 3) }));

  return (
    <Card className="border-border/60 shadow-sm mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-base" data-testid="text-heatmap-title">Profitability Heatmap</CardTitle>
        </div>
        <div className="flex gap-1.5">
          {data.bestDay && (
            <Badge className="bg-green-600 text-[10px] px-1.5" data-testid="badge-best-day">
              <TrendingUp className="h-3 w-3 mr-0.5" /> {data.bestDay}
            </Badge>
          )}
          {data.worstDay && data.worstDay !== data.bestDay && (
            <Badge variant="secondary" className="text-[10px] px-1.5" data-testid="badge-worst-day">
              <TrendingDown className="h-3 w-3 mr-0.5" /> {data.worstDay}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={shortDays} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="shortDay" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Earnings"]}
                labelFormatter={(label) => {
                  const found = shortDays.find((d) => d.shortDay === label);
                  return found ? found.day : label;
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="totalEarnings" radius={[4, 4, 0, 0]}>
                {shortDays.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.totalEarnings, maxEarnings)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {data.heatmap.map((day) => {
            const intensity = maxEarnings > 0 ? day.totalEarnings / maxEarnings : 0;
            return (
              <div
                key={day.day}
                className="text-center p-1.5 rounded-md"
                style={{
                  backgroundColor: intensity > 0
                    ? `rgba(22, 163, 74, ${0.1 + intensity * 0.6})`
                    : "hsl(var(--muted) / 0.3)",
                }}
                data-testid={`heatmap-cell-${day.day.toLowerCase()}`}
              >
                <div className="text-[10px] font-medium">{day.day.substring(0, 2)}</div>
                <div className="text-[10px] font-bold">{day.tripCount}</div>
                <div className="text-[9px] text-muted-foreground">trips</div>
              </div>
            );
          })}
        </div>

        {data.insight && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5" data-testid="text-heatmap-insight">
            {data.insight}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
