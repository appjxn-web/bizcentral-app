
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { useFirestore, useCollection } from '@/firebase';
import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import type { Goal, Milestone, User } from '@/lib/types';
import { Loader2, Award, Trophy, Medal } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  userId: string;
  user: User;
  score: number;
}

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Award className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-orange-400" />;
  return <span className="text-sm font-bold w-5 text-center">{rank}</span>;
};

export default function LeaderboardPage() {
  const firestore = useFirestore();
  const [leaderboardData, setLeaderboardData] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));

  React.useEffect(() => {
    async function calculateScores() {
      if (!firestore || !users) return;
      setLoading(true);
      
      try {
        const milestonesQuery = collectionGroup(firestore, 'milestones');
        const completedMilestonesQuery = query(milestonesQuery, where('status', '==', 'Done'));
        const milestonesSnapshot = await getDocs(completedMilestonesQuery);

        const scores: Record<string, number> = {};

        milestonesSnapshot.forEach(doc => {
          const milestone = doc.data() as Milestone;
          const ownerId = milestone.ownerId;
          const points = milestone.points || 0;
          
          if (ownerId && points > 0) {
            scores[ownerId] = (scores[ownerId] || 0) + points;
          }
        });

        const leaderboard = Object.entries(scores)
          .map(([userId, score]) => {
            const user = users.find(u => u.id === userId);
            return user ? { userId, user, score } : null;
          })
          .filter((entry): entry is LeaderboardEntry => entry !== null)
          .sort((a, b) => b.score - a.score);

        setLeaderboardData(leaderboard);
      } catch (error) {
        console.error("Error calculating leaderboard scores:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!usersLoading) {
      calculateScores();
    }
  }, [firestore, users, usersLoading]);

  return (
    <>
      <PageHeader title="Leaderboard" />
      <Card>
        <CardHeader>
          <CardTitle>Top Performers</CardTitle>
          <CardDescription>
            Ranking based on points earned from completed milestones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-48 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : leaderboardData.length > 0 ? (
                leaderboardData.map((entry, index) => (
                  <TableRow key={entry.userId}>
                    <TableCell>
                      <div className="flex items-center justify-center h-full">
                        {getRankIcon(index + 1)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={(entry.user as any).avatar} />
                          <AvatarFallback>{entry.user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{entry.user.name}</p>
                          <p className="text-sm text-muted-foreground">{entry.user.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-lg font-bold">
                      {entry.score}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                    No scores yet. Complete some milestones to get on the board!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
