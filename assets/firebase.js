import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  getDocs,
  query,
  orderBy
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
  const eventRef = doc(db, buildEventPath(eventId));
  const participantRef = doc(db, `events/${eventId}/participants/${name.toLowerCase()}`);

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

    const count = event.assignedCount || 0;
    if (count >= event.totalSeats) {
      throw new Error("所有座位已滿。");
    }

    const capacities = Array.isArray(event.tableCapacities)
      ? event.tableCapacities
      : Array.from({ length: event.groupCount }, () => event.seatsPerGroup || 0);
    let assignedGroup = capacities.length;
    let prefix = 0;
    for (let i = 0; i < capacities.length; i += 1) {
      prefix += Number(capacities[i]) || 0;
      if (count < prefix) {
        assignedGroup = i + 1;
        break;
      }
    }
    transaction.set(participantRef, {
      name,
      assignedGroup,
      createdAt: Date.now()
    });
    transaction.set(eventRef, { ...event, assignedCount: count + 1 });

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
    transaction.set(eventRef, { ...event, status: "closed" });
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
