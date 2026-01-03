
'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { Order } from '@/lib/types';

interface OverviewChartProps {
  orders?: Order[];
}

const processOrderData = (orders: Order[]) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyData: Record<string, { productRevenue: number; serviceRevenue: number; totalRevenue: number }> = 
    months.reduce((acc, month) => {
      acc[month] = { productRevenue: 0, serviceRevenue: 0, totalRevenue: 0 };
      return acc;
    }, {} as Record<string, { productRevenue: number; serviceRevenue: number; totalRevenue: number }>);

  orders.forEach(order => {
    const month = new Date(order.date).toLocaleString('default', { month: 'short' });
    if (monthlyData[month]) {
      // For simplicity, we'll categorize all sales as 'productRevenue'
      // This could be expanded if order items have a type (product/service)
      monthlyData[month].productRevenue += order.grandTotal;
      monthlyData[month].totalRevenue += order.grandTotal;
    }
  });

  return months.map(month => ({
    name: month,
    ...monthlyData[month]
  }));
};

export function OverviewChart({ orders }: OverviewChartProps) {
  const [data, setData] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (orders) {
      setData(processOrderData(orders));
    }
  }, [orders]);
  
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `₹${value / 1000}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalRevenue"
          name="Total Revenue"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="productRevenue"
          name="Product Revenue"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="serviceRevenue"
          name="Service Revenue"
          stroke="hsl(var(--chart-3))"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
