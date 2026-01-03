'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { OffboardingEmployee, OffboardingTask } from '@/lib/types';
import { Progress } from '@/components/ui/progress';

interface ChecklistDialogProps {
  employee: OffboardingEmployee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChecklistDialog({ employee, open, onOpenChange }: ChecklistDialogProps) {
  const { toast } = useToast();
  const [checklist, setChecklist] = React.useState<OffboardingTask[]>(employee.checklist);

  const handleTaskToggle = (taskId: string) => {
    setChecklist(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task
      )
    );
  };

  const completedTasks = React.useMemo(() => checklist.filter(task => task.isCompleted).length, [checklist]);
  const progress = (completedTasks / checklist.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Off-boarding Checklist for {employee.name}</DialogTitle>
          <DialogDescription>
            Track the completion of necessary off-boarding tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center gap-4">
            <Progress value={progress} className="w-full" />
            <span className="text-sm font-medium text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="space-y-3">
            {checklist.map(task => (
              <div key={task.id} className="flex items-center space-x-3">
                <Checkbox
                  id={`task-${task.id}`}
                  checked={task.isCompleted}
                  onCheckedChange={() => handleTaskToggle(task.id)}
                />
                <Label
                  htmlFor={`task-${task.id}`}
                  className={cn("flex-1 cursor-pointer", task.isCompleted && "line-through text-muted-foreground")}
                >
                  {task.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}