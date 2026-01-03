
'use client';

import * as React from 'react';
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useToast } from '@/hooks/use-toast';
import type { OnboardingEmployee, OnboardingStatus } from '@/lib/types';
import { OnboardingColumn } from './onboarding-column';
import { OnboardingCard } from './onboarding-card';
import { createPortal } from 'react-dom';
import { useFirestore } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';

const defaultCols: { id: OnboardingStatus; title: string }[] = [
  { id: 'Hired', title: 'Hired' },
  { id: 'Documentation', title: 'Documentation' },
  { id: 'Training', title: 'Training' },
  { id: 'Completed', title: 'Completed' },
];

export function OnboardingBoard({ initialEmployees }: { initialEmployees: OnboardingEmployee[] }) {
  const [employees, setEmployees] = React.useState<OnboardingEmployee[]>(initialEmployees);
  const [columns, setColumns] = React.useState(defaultCols);
  const [activeEmployee, setActiveEmployee] = React.useState<OnboardingEmployee | null>(null);
  const firestore = useFirestore();

  const { toast } = useToast();

  React.useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Employee') {
      setActiveEmployee(event.active.data.current.employee);
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveEmployee(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveAnEmployee = active.data.current?.type === 'Employee';
    const isOverAnEmployee = over.data.current?.type === 'Employee';

    if (!isActiveAnEmployee) return;

    let newStatus: OnboardingStatus;
    
    if (isOverAnEmployee) {
        newStatus = over.data.current?.employee.status;
    } else { // It's a column
        newStatus = over.id as OnboardingStatus;
    }
    
    const activeIndex = employees.findIndex((e) => e.id === activeId);
    
    if (employees[activeIndex].status !== newStatus) {
        const updatedEmployee = {
            ...employees[activeIndex],
            status: newStatus,
            completedAt: newStatus === 'Completed' ? new Date().toISOString() : employees[activeIndex].completedAt,
        };

        const employeeRef = doc(firestore, 'onboarding', activeId as string);
        await setDoc(employeeRef, { status: newStatus, completedAt: updatedEmployee.completedAt }, { merge: true });

        toast({
          title: 'Status Updated',
          description: `${employees[activeIndex].name}'s status changed to ${newStatus}.`,
        });
    }
  };
  
  const onDragOver = (event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;
    
    const isActiveAnEmployee = active.data.current?.type === 'Employee';
    const isOverAnEmployee = over.data.current?.type === 'Employee';

    if (!isActiveAnEmployee) return;

    if (isActiveAnEmployee && isOverAnEmployee) {
      const activeIndex = employees.findIndex((e) => e.id === activeId);
      const overIndex = employees.findIndex((e) => e.id === overId);

      if (employees[activeIndex].status !== employees[overIndex].status) {
         setEmployees(prev => {
            const newItems = [...prev];
            newItems[activeIndex].status = employees[overIndex].status;
            return arrayMove(newItems, activeIndex, overIndex);
         });
      } else {
        setEmployees(arrayMove(employees, activeIndex, overIndex));
      }
    }

    const isOverAColumn = over.data.current?.type === 'Column';

    if (isActiveAnEmployee && isOverAColumn) {
        setEmployees(prev => {
           const newItems = [...prev];
           const activeIndex = newItems.findIndex((e) => e.id === activeId);
           newItems[activeIndex].status = overId as OnboardingStatus;
           return arrayMove(newItems, activeIndex, activeIndex);
        });
    }
  };

  const getEmployeesForColumn = (status: OnboardingStatus) => {
     const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return employees.filter((emp) => {
      if (emp.status !== status) return false;
      if (status === 'Completed' && emp.completedAt) {
        return new Date(emp.completedAt) > thirtyDaysAgo;
      }
      return true;
    });
  };
  
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {columns.map((col) => (
            <OnboardingColumn
                key={col.id}
                column={col}
                employees={getEmployeesForColumn(col.id)}
            />
        ))}
      </div>
       {typeof document !== 'undefined' && createPortal(
            <DragOverlay>
            {activeEmployee && (
                <OnboardingCard employee={activeEmployee} isOverlay />
            )}
            </DragOverlay>,
            document.body
        )}
    </DndContext>
  );
}
