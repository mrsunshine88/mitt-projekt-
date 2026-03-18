
'use client';

import { useState, useEffect, useRef } from 'react';
import { onSnapshot, DocumentData, FirestoreError, QuerySnapshot, CollectionReference, Query } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean}) | null | undefined,
): UseCollectionResult<T> {
  const [data, setData] = useState<WithId<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  
  const isMounted = useRef(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      unsubscribeRef.current = onSnapshot(memoizedTargetRefOrQuery!, 
        (snapshot: QuerySnapshot<DocumentData>) => {
          if (!isMounted.current) return;
          const results: WithId<T>[] = [];
          snapshot.forEach((doc) => results.push({ ...(doc.data() as T), id: doc.id } as WithId<T>));
          setData(results);
          setError(null);
          setIsLoading(false);
        },
        (err: FirestoreError) => {
          if (!isMounted.current) return;
          
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
          }

          setData(null);

          if (err.code === 'permission-denied') {
            const path = (memoizedTargetRefOrQuery as any).path || (memoizedTargetRefOrQuery as any)._query?.path?.canonicalString() || 'unknown-path';
            console.warn("Firestore: Permission denied for collection/query:", path);
            const contextualError = new FirestorePermissionError({ operation: 'list', path });
            setError(contextualError);
          } else {
            setError(err);
          }
          
          setIsLoading(false);
        }
      );
    } catch (e: any) {
      if (isMounted.current) {
        setError(e);
        setIsLoading(false);
      }
    }

    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [memoizedTargetRefOrQuery]);

  if(memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error('Firestore reference/query must be memoized using useMemoFirebase');
  }
  
  return { data, isLoading, error };
}
