
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { useFirestore, useCollection } from '@/firebase';
import { collection, collectionGroup, query, orderBy, getDocs } from 'firebase/firestore';
import type { Goal, Milestone, User } from '@/lib/types';
import { Loader2, CheckCircle, Clock, CircleDashed } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type TimelineItem = Milestone & {
  goalTitle: string;
  goalId: string;
};

const getStatusIcon = (status: Milestone['status']) => {
  switch (status) {
    case 'Done':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'In Progress':
      return <Clock className="h-5 w-5 text-blue-500" />;
    case 'Blocked':
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <CircleDashed className="h-5 w-5 text-gray-400" />;
  }
};

export default function TimelinePage() {
  const firestore = useFirestore();
  const [timelineItems, setTimelineItems] = React.useState<TimelineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { data: users } = useCollection<User>(collection(firestore, 'users'));

  React.useEffect(() => {
    async function fetchData() {
      if (!firestore) return;
      setLoading(true);
      try {
        const goalsQuery = query(collection(firestore, 'goals'), orderBy('endDate'));
        const goalsSnapshot = await getDocs(goalsQuery);
        const goalsData = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Goal[];
        
        const allMilestones: TimelineItem[] = [];

        for (const goal of goalsData) {
          const milestonesQuery = query(collection(firestore, 'goals', goal.id, 'milestones'), orderBy('dueDate'));
          const milestonesSnapshot = await getDocs(milestonesQuery);
          milestonesSnapshot.forEach(doc => {
            allMilestones.push({
              ...(doc.data() as Milestone),
              id: doc.id,
              goalTitle: goal.title,
              goalId: goal.id,
            });
          });
        }

        allMilestones.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setTimelineItems(allMilestones);
      } catch (error) {
        console.error("Error fetching timeline data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [firestore]);
  
  const userMap = React.useMemo(() => {
    if (!users) return new Map();
    return new Map(users.map(u => [u.id, u]));
  }, [users]);

  return (
    <>
      <PageHeader title="Timeline" />
       <Card>
        <CardContent className="p-6">
          {loading ? (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
             </div>
          ) : timelineItems.length > 0 ? (
            <div className="relative pl-6 after:absolute after:inset-y-0 after:left-6 after:w-px after:bg-muted-foreground/20">
              {timelineItems.map((item, index) => {
                const owner = userMap.get(item.ownerId);
                return (
                  <div key={`${item.goalId}-${item.id}`} className="grid grid-cols-[auto,1fr] items-start gap-x-6 gap-y-2">
                    <div className="relative flex h-full items-center">
                      <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background ring-2 ring-primary">
                        {getStatusIcon(item.status)}
                      </div>
                    </div>
                    <div className="pb-10">
                        <p className="text-sm font-semibold text-muted-foreground">
                            {format(new Date(item.dueDate), 'PPP')}
                        </p>
                        <div className="mt-2 rounded-lg border bg-card p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-lg">{item.title}</h4>
                                <Badge variant="secondary">{item.goalTitle}</Badge>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={owner?.avatar} />
                                    <AvatarFallback>{owner?.name.charAt(0) || '?'}</AvatarFallback>
                                </Avatar>
                                <span>{owner?.name || 'Unassigned'}</span>
                            </div>
                        </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
             <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
                <div className="text-center">
                    <h3 className="text-xl font-medium">No Milestones Found</h3>
                    <p className="text-muted-foreground">Create goals and milestones to see them on the timeline.</p>
                </div>
            </div>
          )}
        </CardContent>
       </Card>
    </>
  );
}

