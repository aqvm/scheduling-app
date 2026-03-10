import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getAvailabilityCollectionRef } from '../../../shared/scheduler/firebaseRefs';
import { getMonthDates, isValidMonthValue, toDateKey, toMonthValue } from '../../../shared/scheduler/date';
import { getNextStatusInCycle } from '../../../shared/scheduler/status';
import type { AvailabilityByUser, AvailabilityStatus } from '../../../shared/scheduler/types';
import { membershipDocumentId } from '../utils';

type UseAvailabilityEditorArgs = {
  currentUserId: string | null;
  selectedCampaignId: string;
  campaignAvailability: AvailabilityByUser;
  onError: (message: string) => void;
};

export type UseAvailabilityEditorResult = {
  selectedAvailabilityMonth: string;
  selectedHostSummaryMonth: string;
  selectedPaintStatus: AvailabilityStatus;
  setSelectedPaintStatus: Dispatch<SetStateAction<AvailabilityStatus>>;
  availabilityMonthDates: Date[];
  hostSummaryMonthDateKeys: string[];
  hasUnsavedChanges: boolean;
  isSavingChanges: boolean;
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
  paintDate: (dateKey: string) => void;
  toggleDate: (dateKey: string) => void;
  onSaveChanges: () => void;
  onChangeAvailabilityMonth: (nextValue: string) => void;
  onChangeHostSummaryMonth: (nextValue: string) => void;
  resetAvailabilityEditor: () => void;
};

export function useAvailabilityEditor({
  currentUserId,
  selectedCampaignId,
  campaignAvailability,
  onError
}: UseAvailabilityEditorArgs): UseAvailabilityEditorResult {
  const [selectedAvailabilityMonth, setSelectedAvailabilityMonth] = useState<string>(() =>
    toMonthValue(new Date())
  );
  const [selectedHostSummaryMonth, setSelectedHostSummaryMonth] = useState<string>(() =>
    toMonthValue(new Date())
  );
  const [selectedPaintStatus, setSelectedPaintStatus] = useState<AvailabilityStatus>('available');
  const [pendingEditsByCampaign, setPendingEditsByCampaign] = useState<
    Record<string, Record<string, AvailabilityStatus>>
  >({});
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  const availabilityMonthDates = useMemo(
    () => getMonthDates(selectedAvailabilityMonth),
    [selectedAvailabilityMonth]
  );
  const hostSummaryMonthDates = useMemo(
    () => getMonthDates(selectedHostSummaryMonth),
    [selectedHostSummaryMonth]
  );
  const hostSummaryMonthDateKeys = useMemo(
    () => hostSummaryMonthDates.map((date) => toDateKey(date)),
    [hostSummaryMonthDates]
  );

  const currentCampaignPendingEdits =
    selectedCampaignId.length > 0 ? pendingEditsByCampaign[selectedCampaignId] ?? {} : {};
  const hasUnsavedChanges = Object.keys(currentCampaignPendingEdits).length > 0;

  useEffect(() => {
    if (!currentUserId || !selectedCampaignId) {
      return;
    }

    const userPending = pendingEditsByCampaign[selectedCampaignId];
    if (!userPending || Object.keys(userPending).length === 0) {
      return;
    }

    const userServerDays = campaignAvailability[currentUserId] ?? {};
    const nextPending: Record<string, AvailabilityStatus> = {};

    for (const [dateKey, status] of Object.entries(userPending)) {
      const serverStatus = userServerDays[dateKey] ?? 'unspecified';
      if (serverStatus !== status) {
        nextPending[dateKey] = status;
      }
    }

    const pendingEntries = Object.entries(userPending);
    const nextEntries = Object.entries(nextPending);
    const isEqual =
      pendingEntries.length === nextEntries.length &&
      pendingEntries.every(([dateKey, status]) => nextPending[dateKey] === status);

    if (isEqual) {
      return;
    }

    setPendingEditsByCampaign((current) => {
      if (Object.keys(nextPending).length === 0) {
        const { [selectedCampaignId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [selectedCampaignId]: nextPending
      };
    });
  }, [campaignAvailability, currentUserId, pendingEditsByCampaign, selectedCampaignId]);

  const getStatus = useCallback(
    (userId: string, dateKey: string): AvailabilityStatus => {
      if (currentUserId && selectedCampaignId && userId === currentUserId) {
        const pendingStatus = pendingEditsByCampaign[selectedCampaignId]?.[dateKey];
        if (pendingStatus) {
          return pendingStatus;
        }
      }

      return campaignAvailability[userId]?.[dateKey] ?? 'unspecified';
    },
    [campaignAvailability, currentUserId, pendingEditsByCampaign, selectedCampaignId]
  );

  const setDateStatus = useCallback(
    (dateKey: string, nextStatus: AvailabilityStatus): void => {
      if (!currentUserId || !selectedCampaignId) {
        return;
      }

      const serverStatus = campaignAvailability[currentUserId]?.[dateKey] ?? 'unspecified';

      setPendingEditsByCampaign((current) => {
        const campaignPending = current[selectedCampaignId] ?? {};
        const nextPending = { ...campaignPending };

        if (nextStatus === serverStatus) {
          delete nextPending[dateKey];
        } else {
          nextPending[dateKey] = nextStatus;
        }

        if (Object.keys(nextPending).length === 0) {
          const { [selectedCampaignId]: _removed, ...rest } = current;
          return rest;
        }

        return {
          ...current,
          [selectedCampaignId]: nextPending
        };
      });
    },
    [campaignAvailability, currentUserId, selectedCampaignId]
  );

  const paintDate = useCallback(
    (dateKey: string): void => {
      setDateStatus(dateKey, selectedPaintStatus);
    },
    [selectedPaintStatus, setDateStatus]
  );

  const toggleDate = useCallback(
    (dateKey: string): void => {
      if (!currentUserId) {
        return;
      }

      const currentStatus = getStatus(currentUserId, dateKey);
      setDateStatus(dateKey, getNextStatusInCycle(currentStatus));
    },
    [currentUserId, getStatus, setDateStatus]
  );

  const onSaveChanges = useCallback((): void => {
    if (!currentUserId || !selectedCampaignId || isSavingChanges) {
      return;
    }

    const userPendingEdits = pendingEditsByCampaign[selectedCampaignId];
    if (!userPendingEdits || Object.keys(userPendingEdits).length === 0) {
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      onError('Firebase is not configured.');
      return;
    }

    const nextDays = {
      ...(campaignAvailability[currentUserId] ?? {}),
      ...userPendingEdits
    };

    setIsSavingChanges(true);
    onError('');

    void setDoc(
      doc(availabilityRef, membershipDocumentId(selectedCampaignId, currentUserId)),
      {
        campaignId: selectedCampaignId,
        uid: currentUserId,
        days: nextDays,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
      .then(() => {
        setPendingEditsByCampaign((current) => {
          const { [selectedCampaignId]: _removed, ...rest } = current;
          return rest;
        });
      })
      .catch(() => {
        onError('Unable to save availability changes.');
      })
      .finally(() => {
        setIsSavingChanges(false);
      });
  }, [
    campaignAvailability,
    currentUserId,
    isSavingChanges,
    onError,
    pendingEditsByCampaign,
    selectedCampaignId
  ]);

  const onChangeAvailabilityMonth = useCallback((nextValue: string): void => {
    setSelectedAvailabilityMonth(isValidMonthValue(nextValue) ? nextValue : toMonthValue(new Date()));
  }, []);

  const onChangeHostSummaryMonth = useCallback((nextValue: string): void => {
    setSelectedHostSummaryMonth(isValidMonthValue(nextValue) ? nextValue : toMonthValue(new Date()));
  }, []);

  const resetAvailabilityEditor = useCallback(() => {
    setPendingEditsByCampaign({});
    setIsSavingChanges(false);
  }, []);

  return {
    selectedAvailabilityMonth,
    selectedHostSummaryMonth,
    selectedPaintStatus,
    setSelectedPaintStatus,
    availabilityMonthDates,
    hostSummaryMonthDateKeys,
    hasUnsavedChanges,
    isSavingChanges,
    getStatus,
    paintDate,
    toggleDate,
    onSaveChanges,
    onChangeAvailabilityMonth,
    onChangeHostSummaryMonth,
    resetAvailabilityEditor
  };
}

