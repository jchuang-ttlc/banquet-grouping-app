import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
  getDocs,
  query,
  orderBy,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Fill these values with your Firebase project's web app config.
export const firebaseConfig = {
  apiKey: "AIzaSyAda2t4PkmyIeBm-gNp2LBR_9qrBKRxLjg",
  authDomain: "banquet-grouping.firebaseapp.com",
  projectId: "banquet-grouping",
  storageBucket: "banquet-grouping.firebasestorage.app",
  messagingSenderId: "843387540111",
  appId: "1:843387540111:web:37f43e85609e3ba52216fa",
  measurementId: "G-WCKHLNZX24"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export function buildEventPath(eventId) {
  return `events/${eventId}`;
}

export function participantsCollection(eventId) {
  return collection(db, `events/${eventId}/participants`);
}

function resolveTableCapacities(event) {
  if (Array.isArray(event.tableCapacities) && event.tableCapacities.length > 0) {
    return event.tableCapacities.map((n) => Number(n) || 0);
  }
  const seatsPerGroup = Number(event.seatsPerGroup) || 0;
  const groupCount = Number(event.groupCount) || 0;
  if (seatsPerGroup > 0 && groupCount > 0) {
    return Array.from({ length: groupCount }, () => seatsPerGroup);
  }
  return [];
}

function getFillCountsFromEvent(event, capacities) {
  if (Array.isArray(event.tableFillCounts) && event.tableFillCounts.length === capacities.length) {
    return event.tableFillCounts.map((n) => Number(n) || 0);
  }
  return capacities.map(() => 0);
}

/** Count how many people are already seated at each table. */
export function buildTableFillCounts(participantDocs, tableCapacities) {
  const fillCounts = tableCapacities.map(() => 0);
  participantDocs.forEach((docSnap) => {
    const group = Number(docSnap.data().assignedGroup) || 0;
    if (group >= 1 && group <= tableCapacities.length) {
      fillCounts[group - 1] += 1;
    }
  });
  return fillCounts;
}

/** Randomly pick one table that still has an empty seat. */
export function getRandomAvailableGroup(fillCounts, tableCapacities) {
  const availableGroups = [];
  for (let i = 0; i < tableCapacities.length; i += 1) {
    if (fillCounts[i] < tableCapacities[i]) {
      availableGroups.push(i + 1);
    }
  }
  if (!availableGroups.length) {
    return null;
  }
  const pick = Math.floor(Math.random() * availableGroups.length);
  return availableGroups[pick];
}

/** Sync per-table counts for older events (e.g. dinner2017). */
async function ensureTableFillCountsSynced(eventId) {
  const eventRef = doc(db, buildEventPath(eventId));
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    return;
  }

  const event = eventSnap.data();
  const capacities = resolveTableCapacities(event);
  if (!capacities.length) {
    return;
  }

  const stored = event.tableFillCounts;
  const storedSum = Array.isArray(stored)
    ? stored.reduce((sum, n) => sum + (Number(n) || 0), 0)
    : -1;
  const assignedCount = Number(event.assignedCount) || 0;

  if (Array.isArray(stored) && stored.length === capacities.length && storedSum === assignedCount) {
    return;
  }

  const participantsSnap = await getDocs(participantsCollection(eventId));
  const fillCounts = buildTableFillCounts(participantsSnap.docs, capacities);
  await updateDoc(eventRef, { tableFillCounts: fillCounts });
}

export async function saveEventConfig({
  eventId,
  adminCode,
  tableCapacities
}) {
  const eventRef = doc(db, buildEventPath(eventId));
  const normalizedCapacities = tableCapacities.map((n) => Number(n));
  await setDoc(eventRef, {
    eventId,
    adminCode,
    groupCount: normalizedCapacities.length,
    tableCapacities: normalizedCapacities,
    tableFillCounts: normalizedCapacities.map(() => 0),
    totalSeats: normalizedCapacities.reduce((sum, n) => sum + n, 0),
    assignedCount: 0,
    createdAt: Date.now(),
    status: "open"
  });
}

export async function getEventConfig(eventId) {
  const eventRef = doc(db, buildEventPath(eventId));
  const snap = await getDoc(eventRef);
  if (!snap.exists()) {
    return null;
  }
  return snap.data();
}

export async function registerParticipant({ eventId, name }) {
  const normalizedEventId = eventId.trim().toLowerCase();
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedEventId || !normalizedName) {
    throw new Error("活動代碼與名稱不可為空。");
  }

  await ensureTableFillCountsSynced(normalizedEventId);

  const eventRef = doc(db, buildEventPath(normalizedEventId));
  const participantRef = doc(
    db,
    `events/${normalizedEventId}/participants/${normalizedName.toLowerCase()}`
  );

  return runTransaction(db, async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error("活動不存在，請確認連結。");
    }

    const event = eventSnap.data();
    if (event.status !== "open") {
      throw new Error("活動已關閉，不可再新增。");
    }

    const participantSnap = await transaction.get(participantRef);
    if (participantSnap.exists()) {
      throw new Error("此名稱已報到，請勿重覆輸入。");
    }

    const capacities = resolveTableCapacities(event);
    if (!capacities.length || capacities.some((n) => n < 1)) {
      throw new Error("活動桌次設定不完整，請由管理者重新建立活動。");
    }

    const fillCounts = getFillCountsFromEvent(event, capacities);
    const seatedCount = fillCounts.reduce((sum, n) => sum + n, 0);

    if (seatedCount >= event.totalSeats) {
      throw new Error("所有座位已滿。");
    }

    const assignedGroup = getRandomAvailableGroup(fillCounts, capacities);
    if (!assignedGroup) {
      throw new Error("所有座位已滿。");
    }

    const nextFillCounts = [...fillCounts];
    nextFillCounts[assignedGroup - 1] += 1;

    transaction.set(participantRef, {
      name: normalizedName,
      assignedGroup,
      createdAt: Date.now()
    });
    transaction.update(eventRef, {
      tableFillCounts: nextFillCounts,
      assignedCount: increment(1)
    });

    return assignedGroup;
  });
}

export async function closeEvent(eventId, adminCode) {
  const eventRef = doc(db, buildEventPath(eventId));
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(eventRef);
    if (!snap.exists()) {
      throw new Error("活動不存在。");
    }
    const event = snap.data();
    if (event.adminCode !== adminCode) {
      throw new Error("管理密碼錯誤。");
    }
    transaction.update(eventRef, { status: "closed" });
  });
}

export async function getAllParticipants(eventId, adminCode) {
  const eventRef = doc(db, buildEventPath(eventId));
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    throw new Error("活動不存在。");
  }
  const event = eventSnap.data();
  if (event.adminCode !== adminCode) {
    throw new Error("管理密碼錯誤。");
  }

  const q = query(participantsCollection(eventId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return {
    event,
    participants: snap.docs.map((d) => d.data())
  };
}
