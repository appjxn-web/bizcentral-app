
'use server';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import type { UserProfile } from '@/features/users/types/users.types';
import { initializeFirebase } from '@/firebase';

/**
 * Repository class for managing user data in Firestore.
 * This encapsulates all Firestore logic related to users.
 */
export class UsersRepository {
  private db: Firestore;
  private collectionRef;

  constructor() {
    const { firestore } = initializeFirebase();
    this.db = firestore;
    this.collectionRef = collection(this.db, 'users');
  }

  /**
   * Retrieves a single user profile by their UID.
   * @param uid - The unique identifier of the user.
   * @returns A promise that resolves to the UserProfile or null if not found.
   */
  async getUser(uid: string): Promise<UserProfile | null> {
    const docRef = doc(this.collectionRef, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // Use 'id' property from the document snapshot as the primary ID
      return { id: docSnap.id, ...docSnap.data() } as UserProfile;
    }
    return null;
  }

  /**
   * Retrieves a list of all user profiles.
   * @returns A promise that resolves to an array of UserProfiles.
   */
  async listUsers(): Promise<UserProfile[]> {
    const querySnapshot = await getDocs(this.collectionRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as UserProfile);
  }

  /**
   * Creates a new user profile document in Firestore.
   * @param uid - The UID for the new user.
   * @param data - The user profile data (excluding id).
   * @returns A promise that resolves when the user is created.
   */
  async createUser(uid: string, data: Omit<UserProfile, 'id'>): Promise<void> {
    const userRef = doc(this.collectionRef, uid);
    // Ensure the UID from auth is also stored in the document body
    await setDoc(userRef, { ...data, uid: uid });
  }

  /**
   * Updates an existing user profile document.
   * @param uid - The UID of the user to update.
   * @param data - An object containing the fields to update.
   * @returns A promise that resolves when the update is complete.
   */
  async updateUser(uid: string, data: Partial<Omit<UserProfile, 'id'>>): Promise<void> {
    const userRef = doc(this.collectionRef, uid);
    await updateDoc(userRef, data);
  }
}

// Export a singleton instance of the repository
export const usersRepository = new UsersRepository();
