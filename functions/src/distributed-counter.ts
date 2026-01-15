
import { collection, doc, getDocs, increment, runTransaction, type Firestore } from "firebase/firestore";

/**
 * A distributed counter that can be used to generate sequential numbers at scale.
 * 
 * To use this, you must have a `counters/{counterId}/shards/{shardId}` collection
 * in your Firestore database.
 * 
 * @param db The Firestore instance.
 * @param counterId The ID of the counter to increment.
 * @returns The next number in the sequence.
 */
export async function getNextDistributedCounter(db: Firestore, counterId: string): Promise<number> {
  // Number of shards to distribute writes across.
  const NUM_SHARDS = 5;

  const shardsRef = collection(db, 'counters', counterId, 'shards');
  
  // Initialize shards if they don't exist
  const shardsSnap = await getDocs(shardsRef);
  if (shardsSnap.empty) {
      for (let i = 0; i < NUM_SHARDS; i++) {
          await runTransaction(db, async (transaction) => {
              const shardRef = doc(db, 'counters', counterId, 'shards', String(i));
              transaction.set(shardRef, { count: 0 });
          });
      }
  }

  // Select a random shard to increment
  const shardId = Math.floor(Math.random() * NUM_SHARDS).toString();
  const shardRef = doc(db, 'counters', counterId, 'shards', shardId);

  // Atomically increment the shard's count and get the total.
  return runTransaction(db, async (transaction) => {
    // We increment the selected shard.
    transaction.update(shardRef, { count: increment(1) });

    // To get the total, we need to read all shards, but we do this *outside*
    // of a transaction to avoid contention, or we can approximate.
    // For sequential IDs, we need the actual total.
    const shardsSnapshot = await getDocs(shardsRef);
    let totalCount = 0;
    shardsSnapshot.forEach((doc) => {
      totalCount += doc.data().count;
    });

    // The current transaction's increment isn't reflected in the snapshot yet,
    // so we add 1 to get the new total.
    return totalCount + 1;
  });
}
