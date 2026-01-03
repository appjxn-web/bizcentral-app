'use client';

import * as React from 'react';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { OnboardingEmployee, OnboardingStatus } from '@/lib/types';
import { OnboardingCard } from './onboarding-card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OnboardingColumnProps {
  column: { id: OnboardingStatus; title: string };
  employees: OnboardingEmployee[];
}

export function OnboardingColumn({ column, employees }: OnboardingColumnProps) {
    const employeeIds = React.useMemo(() => employees.map((emp) => emp.id), [employees]);
    
    const { setNodeRef } = useSortable({
        id: column.id,
        data: {
        type: 'Column',
        column,
        },
    });

  return (
    <div
      ref={setNodeRef}
      className="flex h-[calc(100vh-18rem)] flex-col"
    >
        <div className="bg-muted rounded-t-lg p-3 flex items-center justify-between border-b">
            <h3 className="font-semibold">{column.title}</h3>
            <span className="text-sm font-medium bg-background text-muted-foreground rounded-full h-6 w-6 flex items-center justify-center">
                {employees.length}
            </span>
        </div>
        <ScrollArea className="bg-muted/50 rounded-b-lg">
            <div className="flex flex-col gap-2 p-2">
                <SortableContext items={employeeIds}>
                    {employees.map((emp) => (
                        <OnboardingCard key={emp.id} employee={emp} />
                    ))}
                </SortableContext>
            </div>
        </ScrollArea>
    </div>
  );
}
