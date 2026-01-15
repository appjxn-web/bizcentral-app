
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
    // We increment the selected shard.
    transaction.update(shardRef, { count: FieldValue.increment(1) });

    // To get the total, we need to read all shards.
    // For sequential IDs, an accurate count is required.
    const shardsSnapshot = await transaction.get(shardsRef);
    let totalCount = 0;
    shardsSnapshot.forEach((doc) => {
      totalCount += doc.data().count;
    });

    // The current transaction's increment isn't reflected in the snapshot yet,
    // so we add 1 to get the new total.
    return totalCount + 1;
  });
}
