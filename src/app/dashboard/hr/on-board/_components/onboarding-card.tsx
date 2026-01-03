'use client';

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OnboardingEmployee } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GripVertical, Files } from 'lucide-react';
import { OnboardingDocumentsDialog } from './onboarding-documents-dialog';
import { Button } from '@/components/ui/button';


interface OnboardingCardProps {
  employee: OnboardingEmployee;
  isOverlay?: boolean;
}

export function OnboardingCard({ employee, isOverlay }: OnboardingCardProps) {
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = React.useState(false);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: employee.id,
    data: {
      type: 'Employee',
      employee,
    },
    disabled: isDocumentsDialogOpen || employee.status === 'Completed',
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  if (isDragging) {
    return (
      <Card ref={setNodeRef} style={style} className="h-[124px] w-full opacity-50 bg-muted border-dashed" />
    );
  }

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className={cn("touch-none", isOverlay && "shadow-lg", employee.status === 'Completed' && "opacity-75")}
      >
        <CardContent className="p-3">
          <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 rounded-md">
                      <AvatarImage src={employee.avatar} alt={employee.name} />
                      <AvatarFallback>{employee.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                      <CardTitle className="text-base font-medium">{employee.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{employee.position}</p>
                  </div>
              </div>
               <button {...attributes} {...listeners} disabled={employee.status === 'Completed'} className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30">
                  <GripVertical className="h-5 w-5" />
               </button>
          </div>
           <div className="mt-3 pt-3 border-t flex justify-end">
                <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => setIsDocumentsDialogOpen(true)}>
                    <Files className="h-3 w-3 mr-1.5" />
                    Documents
                </Button>
            </div>
        </CardContent>
      </Card>
      <OnboardingDocumentsDialog 
        employee={employee}
        open={isDocumentsDialogOpen}
        onOpenChange={setIsDocumentsDialogOpen}
      />
    </>
  );
}
