

'use client';

import * as React from 'react';
import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Lead } from '@/lib/types';


interface SalesFunnelChartProps {
    leads: Lead[];
}

const processLeadData = (leads: Lead[]) => {
    const stageCounts = {
        'New': 0,
        'Contacted': 0,
        'Qualified': 0,
        'Proposal Sent': 0,
        'Converted': 0,
        'Lost': 0,
    };

    leads.forEach(lead => {
        stageCounts[lead.status] = (stageCounts[lead.status] || 0) + 1;
    });

    return [
      { value: stageCounts['New'] + stageCounts['Contacted'] + stageCounts['Qualified'] + stageCounts['Proposal Sent'] + stageCounts['Converted'] + stageCounts['Lost'], name: 'Leads', fill: '#8884d8' },
      { value: stageCounts['Contacted'] + stageCounts['Qualified'] + stageCounts['Proposal Sent'] + stageCounts['Converted'] + stageCounts['Lost'], name: 'Contacted', fill: '#83a6ed' },
      { value: stageCounts['Qualified'] + stageCounts['Proposal Sent'] + stageCounts['Converted'] + stageCounts['Lost'], name: 'Qualified', fill: '#8dd1e1' },
      { value: stageCounts['Proposal Sent'] + stageCounts['Converted'] + stageCounts['Lost'], name: 'Quotation Sent', fill: '#82ca9d' },
      { value: stageCounts['Converted'], name: 'Converted', fill: '#a4de6c' },
    ];
}

export function SalesFunnelChart({ leads }: SalesFunnelChartProps) {
    const data = React.useMemo(() => processLeadData(leads), [leads]);

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <FunnelChart>
          <Tooltip />
          <Funnel dataKey="value" data={data} isAnimationActive>
            <LabelList
              position="right"
              fill="#000"
              stroke="none"
              dataKey="name"
              />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
