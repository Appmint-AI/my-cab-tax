import { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TaxSummary } from "@shared/schema";

interface DashboardChartsProps {
  summary: TaxSummary;
}

const COLORS = {
  primary: 'hsl(45, 93%, 47%)',
  muted: 'hsl(215, 16%, 47%)',
  expenses: ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fb923c', '#fdba74', '#fed7aa'],
  incomes: ['#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#34d399']
};

export function DashboardCharts({ summary }: DashboardChartsProps) {
  const expenseData = useMemo(() => {
    const items = Object.entries(summary.expensesByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (summary.mileageDeduction > 0) {
      items.push({ name: 'Mileage (IRS)', value: summary.mileageDeduction });
    }
    if (summary.totalPlatformFees > 0) {
      items.push({ name: 'Platform Fees', value: summary.totalPlatformFees });
    }
    return items.sort((a, b) => b.value - a.value);
  }, [summary]);

  const incomeData = useMemo(() => {
    return Object.entries(summary.incomeBySource)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const overviewData = [
    { name: 'Gross', value: Number(summary.grossIncome) },
    { name: 'Deductions', value: Number(summary.totalDeductions) },
    { name: 'Net Profit', value: Number(summary.netProfit) },
    { name: 'SE Tax', value: Number(summary.selfEmploymentTax) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="col-span-1 shadow-md border-border/60">
        <CardHeader>
          <CardTitle>Schedule C Overview</CardTitle>
          <CardDescription>Gross Income, Deductions, Net Profit, and SE Tax</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overviewData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: COLORS.muted, fontSize: 12 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: COLORS.muted }}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                formatter={(val: number) => [`$${Number(val).toFixed(2)}`, '']}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {overviewData.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={index === 0 ? '#22c55e' : index === 1 ? '#ef4444' : index === 2 ? COLORS.primary : '#3b82f6'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="col-span-1 shadow-md border-border/60">
        <CardHeader>
          <CardTitle>Deduction Breakdown</CardTitle>
          <CardDescription>All deductions including IRS mileage and platform fees</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {expenseData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {expenseData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.expenses[index % COLORS.expenses.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: number) => `$${Number(val).toFixed(2)}`}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No deduction data yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
