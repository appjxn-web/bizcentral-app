import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * A distributed counter that can be used to generate sequential numbers at scale.
 * This function uses the Firebase Admin SDK.
 * 
 * To use this, you must have a `counters/{counterId}/shards/{shardId}` collection
 * in your Firestore database.
 * 
 * @param db The Firestore instance from firebase-admin.
 * @param counterName The ID of the counter to increment (e.g., "sales_orders_23-24").
 * @returns The next number in the sequence.
 */
export async function getNextDistributedCounter(db: Firestore, counterName: string): Promise<number> {
  // Number of shards to distribute writes across.
  const NUM_SHARDS = 5;
  const counterRef = db.collection('counters').doc(counterName);
  const shardsRef = counterRef.collection('shards');
  
  return db.runTransaction(async (transaction) => {
    // Check if the counter (and its shards) exist. If not, initialize them.
    const counterDoc = await transaction.get(counterRef);
    if (!counterDoc.exists) {
        // Initialize the main counter document
        transaction.set(counterRef, { _init: true });
        // Initialize each shard document
        for (let i = 0; i < NUM_SHARDS; i++) {
            const shardRef = shardsRef.doc(i.toString());
            transaction.set(shardRef, { count: 0 });
        }
    }

    // Select a random shard to increment
    const shardId = Math.floor(Math.random() * NUM_SHARDS).toString();
    const shardRef = shardsRef.doc(shardId);
    
    // Atomically increment the shard's count.
    transaction.update(shardRef, { count: FieldValue.increment(1) });
    
    // To get the total, we need to read all shards.
    // This is done within the transaction to ensure an accurate, consistent count.
    const allShardsSnapshot = await transaction.get(shardsRef);
    
    let totalCount = 0;
    allShardsSnapshot.forEach((doc) => {
      totalCount += doc.data()?.count || 0;
    });

    // The increment operation in the transaction is not reflected in the snapshot read,
    // so we manually add 1 to get the final, correct new value.
    return totalCount + 1;
  });
}
