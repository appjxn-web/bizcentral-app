
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * A distributed counter that can be used to generate sequential numbers at scale.
 * This function uses the Firebase Admin SDK.
 * 
 * To use this, you must have a `counters/{counterId}/shards/{shardId}` collection
 * in your Firestore database.
 * 
 * @param db The Firestore instance from firebase-admin.
 * @param counterId The ID of the counter to increment.
 * @returns The next number in the sequence.
 */
export async function getNextDistributedCounter(db: Firestore, counterId: string): Promise<number> {
  // Number of shards to distribute writes across.
  const NUM_SHARDS = 5;

  const shardsRef = db.collection('counters').doc(counterId).collection('shards');
  
  // Select a random shard to increment
  const shardId = Math.floor(Math.random() * NUM_SHARDS).toString();
  const shardRef = shardsRef.doc(shardId);

  // Atomically increment the shard's count and get the total.
  return db.runTransaction(async (transaction) => {
    
    // We must ensure the shard exists before trying to update it.
    const shardDoc = await transaction.get(shardRef);
    if (!shardDoc.exists) {
        transaction.set(shardRef, { count: 1 });
        // Since this is the first increment for this shard, we read all others
        // to get the total.
    } else {
        transaction.update(shardRef, { count: FieldValue.increment(1) });
    }

    // To get the total, we need to read all shards.
    // For sequential IDs, an accurate count is required.
    const shardsSnapshot = await transaction.get(shardsRef);
    let totalCount = 0;
    shardsSnapshot.forEach((doc) => {
      // a document might not exist yet, so we guard against that
      totalCount += doc.data()?.count || 0;
    });

    // The current transaction's increment isn't reflected in the snapshot for an existing doc,
    // so we add 1 to get the new total. If the doc was new, its value is 1, and the snapshot
    // won't include it, so adding it to the sum of others is also correct.
    return totalCount + (shardDoc.exists ? 1 : 0);
  });
}
