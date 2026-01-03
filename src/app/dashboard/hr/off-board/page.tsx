
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import type { OffboardingEmployee } from '@/lib/types';
import { OnboardingCard } from './_components/offboarding-card';
import { OnboardingColumn } from './_components/offboarding-column';

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
import { createPortal } from 'react-dom';
import type { OffboardingStatus } from '@/lib/types';
import { useCollection, useFirestore } from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';


const defaultCols: { id: OffboardingStatus; title: string }[] = [
  { id: 'Resigned', title: 'Resigned' },
  { id: 'Knowledge Transfer', title: 'Knowledge Transfer' },
  { id: 'Exit Interview', title: 'Exit Interview' },
  { id: 'Separated', title: 'Separated' },
];

function OffboardingBoard() {
  const firestore = useFirestore();
  const { data: departingEmployees, loading } = useCollection<OffboardingEmployee>(collection(firestore, 'offboarding'));
  const [employees, setEmployees] = React.useState<OffboardingEmployee[]>(departingEmployees || []);
  const [activeEmployee, setActiveEmployee] = React.useState<OffboardingEmployee | null>(null);

  const { toast } = useToast();

  React.useEffect(() => {
    if (departingEmployees) {
      setEmployees(departingEmployees);
    }
  }, [departingEmployees]);

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
    if (!isActiveAnEmployee) return;

    const activeIndex = employees.findIndex((e) => e.id === activeId);
    let newStatus = employees[activeIndex].status;
    let newEmployees = [...employees];

    const isOverAColumn = over.data.current?.type === 'Column';
    if (isOverAColumn) {
        newStatus = over.id as OffboardingStatus;
    }

    const isOverAnEmployee = over.data.current?.type === 'Employee';
    if (isOverAnEmployee) {
        const overIndex = employees.findIndex((e) => e.id === overId);
        newStatus = employees[overIndex].status;
    }
    
    if (employees[activeIndex].status !== newStatus) {
        const updatedEmployee = {
            ...newEmployees[activeIndex],
            status: newStatus,
            completedAt: newStatus === 'Separated' ? new Date().toISOString() : employees[activeIndex].completedAt,
        };
        newEmployees[activeIndex] = updatedEmployee;

        const employeeRef = doc(firestore, 'offboarding', activeId as string);
        await setDoc(employeeRef, { status: newStatus, completedAt: updatedEmployee.completedAt }, { merge: true });

        setEmployees(arrayMove(newEmployees, activeIndex, activeIndex));

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
           newItems[activeIndex].status = overId as OffboardingStatus;
           return arrayMove(newItems, activeIndex, activeIndex);
        });
    }
  };

  const getEmployeesForColumn = (status: OffboardingStatus) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (!employees) return [];

    return employees.filter((emp) => {
        if (emp.status !== status) return false;
        // If the status is 'Separated', only show if separated within the last 30 days
        if (status === 'Separated' && emp.completedAt) {
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
        {loading ? <p>Loading...</p> : defaultCols.map((col) => (
            <OnboardingColumn
                key={col.id}
                column={col}
                employees={getEmployeesForColumn(col.id)}
            />
        ))}
      </div>
       {typeof document !== 'undefined' && activeEmployee && createPortal(
            <DragOverlay>
              <OnboardingCard employee={activeEmployee} isOverlay />
            </DragOverlay>,
            document.body
        )}
    </DndContext>
  );
}


export default function OffBoardPage() {
  return (
    <>
      <PageHeader title="Off-boarding" />
      <div className="flex flex-1">
        <OffboardingBoard />
      </div>
    </>
  );
}
