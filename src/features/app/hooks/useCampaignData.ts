import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import {
  getAvailabilityCollectionRef,
  getCampaignSettingsDocumentRef,
  getCampaignsCollectionRef,
  getMembershipsCollectionRef,
  getNameChangeRequestsCollectionRef
} from '../../../shared/scheduler/firebaseRefs';
import type {
  AvailabilityByUser,
  AvailabilityStatus,
  Campaign,
  CampaignMembership,
  NameChangeRequest,
  UserProfile
} from '../../../shared/scheduler/types';
import {
  isAvailabilityStatus,
  isNameChangeRequestStatus,
  normalizeInviteCode,
  normalizeName
} from '../../../shared/scheduler/validation';
import { createUserAlias, membershipDocumentId } from '../utils';

export type UseCampaignDataResult = {
  memberships: CampaignMembership[];
  campaigns: Campaign[];
  selectedCampaignId: string;
  setSelectedCampaignId: Dispatch<SetStateAction<string>>;
  campaignUsers: UserProfile[];
  campaignAvailability: AvailabilityByUser;
  hostUserId: string;
  setHostUserId: Dispatch<SetStateAction<string>>;
  activeNameChangeRequest: NameChangeRequest | null;
  nameChangeRequests: NameChangeRequest[];
  resetCampaignData: () => void;
};

export function useCampaignData(currentUser: UserProfile | null): UseCampaignDataResult {
  const [memberships, setMemberships] = useState<CampaignMembership[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignUsers, setCampaignUsers] = useState<UserProfile[]>([]);
  const [campaignAvailability, setCampaignAvailability] = useState<AvailabilityByUser>({});
  const [hostUserId, setHostUserId] = useState('');
  const [activeNameChangeRequest, setActiveNameChangeRequest] = useState<NameChangeRequest | null>(null);
  const [nameChangeRequests, setNameChangeRequests] = useState<NameChangeRequest[]>([]);

  const resetCampaignData = useCallback(() => {
    setMemberships([]);
    setCampaigns([]);
    setSelectedCampaignId('');
    setCampaignUsers([]);
    setCampaignAvailability({});
    setHostUserId('');
    setActiveNameChangeRequest(null);
    setNameChangeRequests([]);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setMemberships([]);
      return;
    }

    const membershipsRef = getMembershipsCollectionRef();
    if (!membershipsRef) {
      setMemberships([]);
      return;
    }

    const membershipsQuery = query(membershipsRef, where('uid', '==', currentUser.id), limit(500));

    const unsubscribe = onSnapshot(
      membershipsQuery,
      (snapshot) => {
        const nextMemberships: CampaignMembership[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
          const userId = typeof value.uid === 'string' ? value.uid : '';
          const alias =
            typeof value.alias === 'string' ? normalizeName(value.alias) : createUserAlias(userId);

          if (!campaignId || !userId || !alias) {
            return;
          }

          nextMemberships.push({
            id: docSnapshot.id,
            campaignId,
            userId,
            alias
          });
        });

        nextMemberships.sort((left, right) => left.campaignId.localeCompare(right.campaignId));
        setMemberships(nextMemberships);
      },
      () => {
        setMemberships([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedCampaignId) {
      setActiveNameChangeRequest(null);
      return;
    }

    const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
    if (!nameChangeRequestsRef) {
      setActiveNameChangeRequest(null);
      return;
    }

    const requestDocRef = doc(nameChangeRequestsRef, membershipDocumentId(selectedCampaignId, currentUser.id));

    const unsubscribe = onSnapshot(
      requestDocRef,
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setActiveNameChangeRequest(null);
          return;
        }

        const value = docSnapshot.data();
        const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
        const userId = typeof value.uid === 'string' ? value.uid : '';
        const requestedAlias =
          typeof value.requestedAlias === 'string' ? normalizeName(value.requestedAlias) : '';
        const status = value.status;
        const createdByUid = typeof value.createdByUid === 'string' ? value.createdByUid : '';

        if (!campaignId || !userId || !requestedAlias || !createdByUid || !isNameChangeRequestStatus(status)) {
          setActiveNameChangeRequest(null);
          return;
        }

        setActiveNameChangeRequest({
          id: docSnapshot.id,
          campaignId,
          userId,
          requestedAlias,
          status,
          createdByUid
        });
      },
      () => {
        setActiveNameChangeRequest(null);
      }
    );

    return () => unsubscribe();
  }, [currentUser, selectedCampaignId]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaignId) {
      setNameChangeRequests([]);
      return;
    }

    const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
    if (!nameChangeRequestsRef) {
      setNameChangeRequests([]);
      return;
    }

    const nameChangeRequestsQuery = query(
      nameChangeRequestsRef,
      where('campaignId', '==', selectedCampaignId),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      nameChangeRequestsQuery,
      (snapshot) => {
        const pendingRequests: NameChangeRequest[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
          const userId = typeof value.uid === 'string' ? value.uid : '';
          const requestedAlias =
            typeof value.requestedAlias === 'string' ? normalizeName(value.requestedAlias) : '';
          const status = value.status;
          const createdByUid = typeof value.createdByUid === 'string' ? value.createdByUid : '';

          if (
            !campaignId ||
            !userId ||
            !requestedAlias ||
            !createdByUid ||
            !isNameChangeRequestStatus(status) ||
            status !== 'pending'
          ) {
            return;
          }

          pendingRequests.push({
            id: docSnapshot.id,
            campaignId,
            userId,
            requestedAlias,
            status,
            createdByUid
          });
        });

        pendingRequests.sort((left, right) => left.requestedAlias.localeCompare(right.requestedAlias));
        setNameChangeRequests(pendingRequests);
      },
      () => {
        setNameChangeRequests([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser, selectedCampaignId]);

  useEffect(() => {
    if (!currentUser) {
      setCampaigns([]);
      return;
    }

    const campaignsRef = getCampaignsCollectionRef();
    if (!campaignsRef) {
      setCampaigns([]);
      return;
    }

    const campaignIds = [...new Set(memberships.map((membership) => membership.campaignId))];
    if (campaignIds.length === 0) {
      setCampaigns([]);
      return;
    }

    const campaignsById = new Map<string, Campaign>();
    setCampaigns([]);

    const unsubscribers = campaignIds.map((campaignId) =>
      onSnapshot(
        doc(campaignsRef, campaignId),
        (docSnapshot) => {
          if (!docSnapshot.exists()) {
            campaignsById.delete(campaignId);
          } else {
            const value = docSnapshot.data();
            const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
            const inviteCode =
              typeof value.inviteCode === 'string' ? normalizeInviteCode(value.inviteCode) : '';
            const inviteEnabled = value.inviteEnabled === true;
            const createdByUid = typeof value.createdByUid === 'string' ? value.createdByUid : '';

            if (!name || !inviteCode || !createdByUid) {
              campaignsById.delete(campaignId);
            } else {
              campaignsById.set(campaignId, {
                id: campaignId,
                name,
                inviteCode,
                inviteEnabled,
                createdByUid
              });
            }
          }

          setCampaigns([...campaignsById.values()].sort((left, right) => left.name.localeCompare(right.name)));
        },
        () => {
          campaignsById.delete(campaignId);
          setCampaigns([...campaignsById.values()].sort((left, right) => left.name.localeCompare(right.name)));
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser, memberships]);

  useEffect(() => {
    if (campaigns.length === 0) {
      setSelectedCampaignId('');
      return;
    }

    if (!campaigns.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignUsers([]);
      return;
    }

    const membershipsRef = getMembershipsCollectionRef();
    if (!membershipsRef) {
      setCampaignUsers([]);
      return;
    }

    const campaignUsersQuery = query(
      membershipsRef,
      where('campaignId', '==', selectedCampaignId),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      campaignUsersQuery,
      (snapshot) => {
        const users: UserProfile[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const userId = typeof value.uid === 'string' ? value.uid : '';
          const alias =
            typeof value.alias === 'string' ? normalizeName(value.alias) : createUserAlias(userId);

          if (!userId || !alias) {
            return;
          }

          users.push({
            id: userId,
            alias,
            role: 'member'
          });
        });

        users.sort((left, right) => left.alias.localeCompare(right.alias));
        setCampaignUsers(users);
      },
      () => {
        setCampaignUsers([]);
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignAvailability({});
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      setCampaignAvailability({});
      return;
    }

    const availabilityQuery = query(availabilityRef, where('campaignId', '==', selectedCampaignId), limit(1000));

    const unsubscribe = onSnapshot(
      availabilityQuery,
      (snapshot) => {
        const availability: AvailabilityByUser = {};

        snapshot.forEach((docSnapshot) => {
          const raw = docSnapshot.data();
          const daysRaw = raw.days;
          const userId = typeof raw.uid === 'string' ? raw.uid : '';

          if (!userId) {
            return;
          }

          if (!daysRaw || typeof daysRaw !== 'object') {
            availability[userId] = {};
            return;
          }

          const days: Record<string, AvailabilityStatus> = {};
          for (const [dateKey, statusValue] of Object.entries(daysRaw as Record<string, unknown>)) {
            if (isAvailabilityStatus(statusValue)) {
              days[dateKey] = statusValue;
            }
          }

          availability[userId] = days;
        });

        setCampaignAvailability(availability);
      },
      () => {
        setCampaignAvailability({});
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setHostUserId('');
      return;
    }

    const settingsDocRef = getCampaignSettingsDocumentRef(selectedCampaignId);
    if (!settingsDocRef) {
      setHostUserId('');
      return;
    }

    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnapshot) => {
        const value = docSnapshot.data();
        const nextHostUserId = typeof value?.hostUserId === 'string' ? value.hostUserId : '';
        setHostUserId(nextHostUserId);
      },
      () => {
        setHostUserId('');
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  return {
    memberships,
    campaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    campaignUsers,
    campaignAvailability,
    hostUserId,
    setHostUserId,
    activeNameChangeRequest,
    nameChangeRequests,
    resetCampaignData
  };
}

