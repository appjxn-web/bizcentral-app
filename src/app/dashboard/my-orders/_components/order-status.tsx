
'use client';

import * as React from 'react';
import { CheckCircle, Factory, CreditCard, Truck, Package, PackageCheck, FileText } from 'lucide-react';
import type { OrderStatus, UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';


const steps: { status: OrderStatus; icon: React.ElementType; label: string }[] = [
  { status: 'Ordered', icon: PackageCheck, label: 'Ordered' },
  { status: 'Manufacturing', icon: Factory, label: 'Manufacturing' },
  { status: 'Ready for Dispatch', icon: Package, label: 'Ready for Dispatch' },
  { status: 'Awaiting Payment', icon: CreditCard, label: 'Awaiting Payment' },
  { status: 'Invoice Sent', icon: FileText, label: 'Invoice Sent' },
  { status: 'Shipped', icon: Truck, label: 'Shipped' },
  { status: 'Delivered', icon: CheckCircle, label: 'Delivered' },
];

interface OrderStatusProps {
  currentStatus: OrderStatus;
  canChangeStatus: boolean;
  availableNextStatuses: OrderStatus[];
  onStatusChange: (newStatus: OrderStatus) => void;
}

function StatusStep({
  step,
  isCompleted,
  isCurrent,
  canChange,
  availableNextStatuses,
  onStatusChange,
}: {
  step: typeof steps[0];
  isCompleted: boolean;
  isCurrent: boolean;
  canChange: boolean;
  availableNextStatuses: OrderStatus[];
  onStatusChange: (newStatus: OrderStatus) => void;
}) {
  const isClickable = canChange && availableNextStatuses.includes(step.status);

  const content = (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
          isCompleted ? 'bg-green-500 text-white' : '',
          isCurrent ? 'bg-primary text-primary-foreground' : '',
          !isCompleted && !isCurrent ? 'bg-muted border' : '',
          isClickable && 'hover:bg-primary/20 hover:border-primary'
        )}
      >
        <step.icon className="w-5 h-5" />
      </div>
      <p
        className={cn(
          "text-xs mt-1 text-center",
          isCurrent ? "font-bold text-primary" : "text-muted-foreground",
          isCompleted ? "font-medium" : ""
        )}
      >
        {step.label}
      </p>
    </div>
  );

  if (isClickable) {
    return (
        <Button variant="ghost" className="h-auto p-1 flex flex-col items-center" onClick={(e) => {
            e.stopPropagation(); // Prevent card collapse/expand
            onStatusChange(step.status);
        }}>
            {content}
        </Button>
    );
  }

  return <div className="p-1">{content}</div>;
}


export function OrderStatusTracker({ currentStatus, canChangeStatus, availableNextStatuses, onStatusChange }: OrderStatusProps) {
  const currentStepIndex = steps.findIndex(step => step.status === currentStatus);

  return (
    <div className="flex items-start justify-between w-full">
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const isLastStep = index === steps.length - 1;

        return (
          <React.Fragment key={step.status}>
            <StatusStep
              step={step}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              canChange={canChangeStatus}
              availableNextStatuses={availableNextStatuses}
              onStatusChange={onStatusChange}
            />
            {!isLastStep && (
              <div className={cn(
                  "flex-1 h-1 mx-2 mt-4",
                  isCompleted ? "bg-green-500" : "bg-muted"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
