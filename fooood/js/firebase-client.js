// Thin data-access layer wrapping the Firebase JS SDK (Firestore + Cloud
// Storage), loaded straight from the gstatic CDN as ES modules — no build
// step, matching the rest of this project. app.js only ever talks to the
// functions exported here; it never touches the Firestore/Storage SDK
// directly, the same role js/supabase-client.js used to play.
//
// Every read/write helper below returns { data, error } (mirroring the old
// Supabase client's shape) so the call sites in app.js barely change shape,
// even though the underlying calls are now Firestore's function-based API
// instead of a chainable query builder.
//
// Firestore documents use camelCase field names (iconUrl, photoUrl,
// listId, createdAt) — the idiomatic convention for Firestore/JS, unlike
// the snake_case columns Postgres used.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

export const CONFIG_IS_MISSING =
  !window.APP_CONFIG ||
  !window.APP_CONFIG.FIREBASE_API_KEY ||
  window.APP_CONFIG.FIREBASE_API_KEY.includes('YOUR-') ||
  !window.APP_CONFIG.FIREBASE_PROJECT_ID ||
  window.APP_CONFIG.FIREBASE_PROJECT_ID.includes('YOUR-');

let firestoreDb = null;
let storageInstance = null;

if (!CONFIG_IS_MISSING) {
  const firebaseApp = initializeApp({
    apiKey: window.APP_CONFIG.FIREBASE_API_KEY,
    authDomain: window.APP_CONFIG.FIREBASE_AUTH_DOMAIN,
    projectId: window.APP_CONFIG.FIREBASE_PROJECT_ID,
    storageBucket: window.APP_CONFIG.FIREBASE_STORAGE_BUCKET,
    appId: window.APP_CONFIG.FIREBASE_APP_ID,
  });
  firestoreDb = getFirestore(firebaseApp);
  storageInstance = getStorage(firebaseApp);
}

// Firestore errors carry a `.code` like "permission-denied" or
// "failed-precondition" (the latter is what a missing composite index
// throws) — surfacing it alongside the message is usually the actionable
// part, the same way a Postgres error code used to point at the fix.
function friendlyError(err) {
  const message = err && err.code ? `${err.message} (${err.code})` : ((err && err.message) || String(err));
  return { message };
}

/* -------------------------------- lists ------------------------------------ */

// Fetches every list plus a lightweight summary of its items (id/name/rank
// only) so the home page can show an item count and top pick — the
// Firestore equivalent of Supabase's embedded `food_items(id,name,rank)`
// select. Firestore has no joins, so this runs as two flat queries and
// groups the items client-side instead.
export async function fetchListsWithItemSummaries() {
  try {
    const [listsSnap, itemsSnap] = await Promise.all([
      getDocs(query(collection(firestoreDb, 'lists'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(firestoreDb, 'food_items'), orderBy('rank', 'asc'))),
    ]);
    const itemsByList = new Map();
    itemsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (!itemsByList.has(d.listId)) itemsByList.set(d.listId, []);
      itemsByList.get(d.listId).push({ id: docSnap.id, name: d.name, rank: d.rank });
    });
    const data = listsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      food_items: itemsByList.get(docSnap.id) || [],
    }));
    return { data, error: null };
  } catch (err) {
    return { data: null, error: friendlyError(err) };
  }
}

export async function fetchList(listId) {
  try {
    const snap = await getDoc(doc(firestoreDb, 'lists', listId));
    if (!snap.exists()) return { data: null, error: null };
    return { data: { id: snap.id, ...snap.data() }, error: null };
  } catch (err) {
    return { data: null, error: friendlyError(err) };
  }
}

export async function insertList(payload) {
  try {
    const newDoc = await addDoc(collection(firestoreDb, 'lists'), { ...payload, createdAt: serverTimestamp() });
    return { data: { id: newDoc.id }, error: null };
  } catch (err) {
    return { data: null, error: friendlyError(err) };
  }
}

export async function updateListDoc(listId, payload) {
  try {
    await updateDoc(doc(firestoreDb, 'lists', listId), payload);
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

// Firestore has no ON DELETE CASCADE — deleting a list must also delete
// every food_items doc that references it. Done as one batch so it's
// all-or-nothing rather than leaving orphaned items behind on a partial
// failure.
export async function deleteListCascade(listId) {
  try {
    const itemsSnap = await getDocs(query(collection(firestoreDb, 'food_items'), where('listId', '==', listId)));
    const batch = writeBatch(firestoreDb);
    itemsSnap.forEach((docSnap) => batch.delete(docSnap.ref));
    batch.delete(doc(firestoreDb, 'lists', listId));
    await batch.commit();
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

/* ------------------------------ food items --------------------------------- */

// Requires a composite index on food_items (listId ASC, rank ASC) — see
// firestore.indexes.json / the README's setup steps. Without it Firestore
// throws a "failed-precondition" error with a console link to create it.
export async function fetchFoodItems(listId) {
  try {
    const snap = await getDocs(query(
      collection(firestoreDb, 'food_items'),
      where('listId', '==', listId),
      orderBy('rank', 'asc'),
    ));
    const data = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return { data, error: null };
  } catch (err) {
    return { data: null, error: friendlyError(err) };
  }
}

export async function insertFoodItem(payload) {
  try {
    await addDoc(collection(firestoreDb, 'food_items'), { ...payload, createdAt: serverTimestamp() });
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function updateFoodItemDoc(itemId, payload) {
  try {
    await updateDoc(doc(firestoreDb, 'food_items', itemId), payload);
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function deleteFoodItemDoc(itemId) {
  try {
    await deleteDoc(doc(firestoreDb, 'food_items', itemId));
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

// Renumbers every item's rank in one batch after a drag-to-reorder.
export async function updateFoodItemRanks(items) {
  try {
    const batch = writeBatch(firestoreDb);
    items.forEach((item) => batch.update(doc(firestoreDb, 'food_items', item.id), { rank: item.rank }));
    await batch.commit();
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

/* -------------------------------- storage ----------------------------------- */

// Throws on failure (upload or URL-fetch) rather than returning { error } —
// the two call sites in app.js already expect a throwing upload function
// and wrap it in try/catch themselves.
export async function uploadImage(path, blob, contentType) {
  const storageRef = ref(storageInstance, path);
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}
