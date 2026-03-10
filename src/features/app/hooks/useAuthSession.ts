import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { getUsersCollectionRef } from '../../../shared/scheduler/firebaseRefs';
import type { UserProfile } from '../../../shared/scheduler/types';
import { isUserRole, normalizeName } from '../../../shared/scheduler/validation';
import { createUserAlias } from '../utils';

export type UseAuthSessionResult = {
  authUserId: string;
  authReady: boolean;
  profileReady: boolean;
  userProfile: UserProfile | null;
  setUserProfile: Dispatch<SetStateAction<UserProfile | null>>;
};

export function useAuthSession(): UseAuthSessionResult {
  const [authUserId, setAuthUserId] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUserId(user.uid);
        setAuthReady(true);
        return;
      }

      setAuthUserId('');
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !authReady) {
      if (!db) {
        setProfileReady(true);
      }

      return;
    }

    if (!authUserId) {
      setUserProfile(null);
      setProfileReady(true);
      return;
    }

    const usersRef = getUsersCollectionRef();
    if (!usersRef) {
      setUserProfile(null);
      setProfileReady(true);
      return;
    }

    setProfileReady(false);

    const unsubscribe = onSnapshot(
      doc(usersRef, authUserId),
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setUserProfile(null);
          setProfileReady(true);
          return;
        }

        const value = docSnapshot.data();
        const alias =
          typeof value.alias === 'string'
            ? normalizeName(value.alias)
            : createUserAlias(docSnapshot.id);
        const role = value.role;

        if (!alias || !isUserRole(role)) {
          setUserProfile(null);
          setProfileReady(true);
          return;
        }

        setUserProfile({
          id: docSnapshot.id,
          alias,
          role
        });
        setProfileReady(true);
      },
      () => {
        setUserProfile(null);
        setProfileReady(true);
      }
    );

    return () => unsubscribe();
  }, [authReady, authUserId]);

  return {
    authUserId,
    authReady,
    profileReady,
    userProfile,
    setUserProfile
  };
}

