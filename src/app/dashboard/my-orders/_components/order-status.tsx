
'use client';

import * as React from 'react';
import { CheckCircle, Factory, CreditCard, Truck, Package, PackageCheck, FileText } from 'lucide-react';
import type { OrderStatus, UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  isFuture,
  canChange,
  availableNextStatuses,
  onStatusChange,
}: {
  step: typeof steps[0];
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  canChange: boolean;
  availableNextStatuses: OrderStatus[];
  onStatusChange: (newStatus: OrderStatus) => void;
}) {
  const isClickable = canChange && (isCurrent || isCompleted);
  const possibleNextSteps = isCurrent ? availableNextStatuses : [step.status];

  const content = (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
          isCompleted ? 'bg-green-500 text-white' : '',
          isCurrent ? 'bg-primary text-primary-foreground' : '',
          isFuture ? 'bg-muted border' : ''
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

  if (isClickable && availableNextStatuses.length > 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="cursor-pointer">
            {content}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {availableNextStatuses.map(status => (
            <DropdownMenuItem key={status} onSelect={() => onStatusChange(status)}>
              Change to: {status}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return content;
}


export function OrderStatusTracker({ currentStatus, canChangeStatus, availableNextStatuses, onStatusChange }: OrderStatusProps) {
  const currentStepIndex = steps.findIndex(step => step.status === currentStatus);

  return (
    <div className="flex items-center justify-between w-full">
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const isFuture = index > currentStepIndex;
        const isLastStep = index === steps.length - 1;

        return (
          <React.Fragment key={step.status}>
            <StatusStep
              step={step}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isFuture={isFuture}
              canChange={canChangeStatus}
              availableNextStatuses={availableNextStatuses}
              onStatusChange={onStatusChange}
            />
            {!isLastStep && (
              <div className={cn(
                  "flex-1 h-1 mx-2",
                  isCompleted ? "bg-green-500" : "bg-muted"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
