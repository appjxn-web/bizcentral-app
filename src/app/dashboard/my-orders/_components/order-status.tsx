
'use client';

import * as React from 'react';
import { CheckCircle, Factory, CreditCard, Truck, Package, PackageCheck } from 'lucide-react';
import type { OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const steps: { status: OrderStatus; icon: React.ElementType; label: string }[] = [
  { status: 'Ordered', icon: PackageCheck, label: 'Ordered' },
  { status: 'Manufacturing', icon: Factory, label: 'Manufacturing' },
  { status: 'Ready for Dispatch', icon: Package, label: 'Ready for Dispatch' },
  { status: 'Awaiting Payment', icon: CreditCard, label: 'Awaiting Payment' },
  { status: 'Shipped', icon: Truck, label: 'Shipped' },
  { status: 'Delivered', icon: CheckCircle, label: 'Delivered' },
];

interface OrderStatusProps {
  currentStatus: OrderStatus;
}

export function OrderStatusTracker({ currentStatus }: OrderStatusProps) {
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
              <p className={cn(
                  "text-xs mt-1 text-center",
                  isCurrent ? "font-bold text-primary" : "text-muted-foreground",
                  isCompleted ? "font-medium" : ""
              )}>
                {step.label}
              </p>
            </div>
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
