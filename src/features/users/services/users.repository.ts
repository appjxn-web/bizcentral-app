'use server';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { UserProfile } from '@/features/users/types/users.types';
import { initializeFirebase } from "@/firebase";

const { firestore: db } = initializeFirebase();
const usersCollectionRef = collection(db, 'users');

/**
 * Retrieves a single user profile by their UID.
 * @param uid - The unique identifier of the user.
 * @returns A promise that resolves to the UserProfile or null if not found.
 */
export async function getUser(uid: string): Promise<UserProfile | null> {
    const docRef = doc(usersCollectionRef, uid);
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
export async function listUsers(): Promise<UserProfile[]> {
    const querySnapshot = await getDocs(usersCollectionRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as UserProfile);
}

/**
 * Creates a new user profile document in Firestore.
 * @param uid - The UID for the new user.
 * @param data - The user profile data (excluding id).
 * @returns A promise that resolves when the user is created.
 */
export async function createUser(uid: string, data: Omit<UserProfile, 'id'>): Promise<void> {
    const userRef = doc(usersCollectionRef, uid);
    // Ensure the UID from auth is also stored in the document body
    await setDoc(userRef, { ...data, uid: uid });
}

/**
 * Updates an existing user profile document.
 * @param uid - The UID of the user to update.
 * @param data - An object containing the fields to update.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateUser(uid: string, data: Partial<Omit<UserProfile, 'id'>>): Promise<void> {
    const userRef = doc(usersCollectionRef, uid);
    await updateDoc(userRef, data);
}

export const usersRepository = {
  getUser,
  listUsers,
  createUser,
  updateUser,
};