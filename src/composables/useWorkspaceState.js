import { ref, watch } from 'vue';

const STORAGE_META_KEY = 'motion-workspace-sync-v3';
const STORAGE_GROUPS_CHUNK_PREFIX = 'motion-workspace-groups-v3-';
const STORAGE_TABS_CHUNK_PREFIX = 'motion-workspace-tabs-v3-';
const LEGACY_SYNC_GROUPS_KEY = 'motion-workspace-groups-v2';
const LEGACY_SYNC_TABS_KEY = 'motion-workspace-tabs-v2';
const LEGACY_STORAGE_KEY = 'motion-workspace-v1';
const SYNC_ITEM_BUDGET = 7600;

const currentTabs = ref([]);
const groups = ref([]);
const isPanelOpen = ref(false);
const isDraggingTab = ref(false);
const isReady = ref(false);
const activeGroupItemDrag = ref(null);

let initializationPromise = null;
let persistenceRegistered = false;
let chromeListenersRegistered = false;
let isHydrating = false;
let saveGroupsPromise = Promise.resolve();
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const issuedIds = new Set();
let nextIdCursor = Math.floor(Math.random() * 100000);

const canUseChromeTabs = () => typeof chrome !== 'undefined' && Boolean(chrome.tabs?.query);
const canUseChromeSyncStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
const canUseChromeLocalStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);

const registerKnownId = (id) => {
  if (id === null || id === undefined || id === '') {
    return '';
  }

  const normalizedId = String(id);
  issuedIds.add(normalizedId);
  return normalizedId;
};

const registerWorkspaceIds = () => {
  for (const group of groups.value) {
    registerKnownId(group?.id);

    if (!Array.isArray(group?.items)) {
      continue;
    }

    for (const item of group.items) {
      registerKnownId(item?.id);
    }
  }
};

const createId = () => {
  registerWorkspaceIds();

  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const candidate = String((nextIdCursor + attempt) % 100000).padStart(5, '0');

    if (issuedIds.has(candidate)) {
      continue;
    }

    issuedIds.add(candidate);
    nextIdCursor = (Number(candidate) + 1) % 100000;
    return candidate;
  }

  throw new Error('No available 5-digit IDs remain.');
};

const tabTitle = (tab) => tab.title || tab.pendingTitle || 'Untitled tab';

const tabUrl = (tab) => {
  const rawUrl = tab.url || tab.pendingUrl;

  if (!rawUrl) {
    return 'No URL';
  }

  try {
    return new URL(rawUrl).href;
  } catch {
    return rawUrl;
  }
};

const normalizeUrlForComparison = (url) => {
  if (!url || url === 'No URL') {
    return '';
  }

  try {
    return new URL(url).href;
  } catch {
    return String(url).trim();
  }
};

const resolveFavIconUrl = (url, fallback = '') => {
  if (fallback) {
    return fallback;
  }

  const normalizedUrl = normalizeUrlForComparison(url);

  if (!normalizedUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }

    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(parsedUrl.origin)}&sz=32`;
  } catch {
    return '';
  }
};

const normalizeTabSnapshot = (tab) => ({
  tabId: typeof tab.id === 'number' ? tab.id : null,
  windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
  title: tabTitle(tab),
  url: tabUrl(tab),
  favIconUrl: resolveFavIconUrl(tabUrl(tab), tab.favIconUrl || '')
});

const cloneTabForGroup = (tab) => ({
  id: createId(),
  ...normalizeTabSnapshot(tab)
});

const normalizeGroupItem = (item) => ({
  id: registerKnownId(item.id) || createId(),
  tabId: typeof item.tabId === 'number' ? item.tabId : null,
  windowId: typeof item.windowId === 'number' ? item.windowId : null,
  title: item.title || 'Untitled tab',
  url: item.url || 'No URL',
  favIconUrl: resolveFavIconUrl(item.url || 'No URL', item.favIconUrl || '')
});

const normalizeGroup = (group, index) => ({
  id: registerKnownId(group.id) || createId(),
  name: (group.name || '').trim() || `Group ${index + 1}`,
  isCollapsed: Boolean(group.isCollapsed),
  items: Array.isArray(group.items) ? group.items.map(normalizeGroupItem) : []
});

const getSerializedSize = (value) => {
  const serializedValue = JSON.stringify(value);

  return textEncoder ? textEncoder.encode(serializedValue).length : serializedValue.length;
};

const createChunkKey = (prefix, index) => `${prefix}${index}`;

const chunkArrayForSync = (entries, prefix) => {
  const chunks = [];
  let currentChunk = [];

  for (const entry of entries) {
    const nextChunk = [...currentChunk, entry];
    const estimatedSize = getSerializedSize(nextChunk) + createChunkKey(prefix, chunks.length).length;

    if (currentChunk.length && estimatedSize > SYNC_ITEM_BUDGET) {
      chunks.push(currentChunk);
      currentChunk = [entry];
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk.length) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const flattenChunkedArrays = (chunkedValues) => chunkedValues.flatMap((value) => (Array.isArray(value) ? value : []));

const normalizeStoredTabEntry = (entry, fallbackId = '') => {
  if (Array.isArray(entry)) {
    return {
      id: registerKnownId(entry[0] || fallbackId) || createId(),
      title: entry[1] || 'Untitled tab',
      url: entry[2] || 'No URL'
    };
  }

  return {
    id: registerKnownId(entry?.id || fallbackId) || createId(),
    title: entry?.title || 'Untitled tab',
    url: entry?.url || 'No URL'
  };
};

const serializeWorkspace = () => {
  const tabs = [];
  const tabIndexById = new Map();
  const serializedGroups = groups.value.map((group) => {
    const itemIndexes = [];

    if (Array.isArray(group.items)) {
      for (const item of group.items) {
        if (!item?.id) {
          continue;
        }

        let tabIndex = tabIndexById.get(item.id);

        if (tabIndex === undefined) {
          tabIndex = tabs.length;
          tabs.push([
            item.id,
            item.title || 'Untitled tab',
            item.url || 'No URL'
          ]);
          tabIndexById.set(item.id, tabIndex);
        }

        itemIndexes.push(tabIndex);
      }
    }

    return [
      group.id,
      group.name,
      Boolean(group.isCollapsed) ? 1 : 0,
      itemIndexes
    ];
  });

  return {
    serializedGroups,
    tabs
  };
};

const hydrateGroupsFromCollections = (storedGroups, storedTabs) => {
  if (!Array.isArray(storedGroups)) {
    return [];
  }

  const tabEntries = Array.isArray(storedTabs)
    ? storedTabs.map((entry) => normalizeStoredTabEntry(entry))
    : [];
  const legacyTabEntries = !Array.isArray(storedTabs) && storedTabs && typeof storedTabs === 'object'
    ? storedTabs
    : null;

  return storedGroups.map((group, index) => {
    if (Array.isArray(group)) {
      const itemIndexes = Array.isArray(group[3]) ? group[3] : [];

      return {
        id: registerKnownId(group[0]) || createId(),
        name: (group[1] || '').trim() || `Group ${index + 1}`,
        isCollapsed: Boolean(group[2]),
        items: itemIndexes
          .map((itemIndex) => tabEntries[itemIndex] || null)
          .filter(Boolean)
          .map((item) => normalizeStoredTabEntry(item))
          .map(normalizeGroupItem)
      };
    }

    return {
      id: registerKnownId(group?.id) || createId(),
      name: (group?.name || '').trim() || `Group ${index + 1}`,
      isCollapsed: Boolean(group?.isCollapsed),
      items: Array.isArray(group?.itemIds)
        ? group.itemIds
          .map((itemId) => {
            const entry = legacyTabEntries?.[itemId];

            return entry ? normalizeStoredTabEntry(entry, itemId) : null;
          })
          .filter(Boolean)
          .map(normalizeGroupItem)
        : Array.isArray(group?.items)
          ? group.items.map(normalizeGroupItem)
          : []
    };
  });
};

const getChunkKeys = (prefix, count) => Array.from({ length: count }, (_, index) => createChunkKey(prefix, index));

const loadChunkedCollection = async (prefix, count) => {
  if (!count) {
    return [];
  }

  const chunkKeys = getChunkKeys(prefix, count);
  const result = await chrome.storage.sync.get(chunkKeys);

  return flattenChunkedArrays(chunkKeys.map((key) => result?.[key]));
};

const saveGroups = async () => {
  if (!canUseChromeSyncStorage()) {
    return;
  }

  const { serializedGroups, tabs } = serializeWorkspace();
  const groupChunks = chunkArrayForSync(serializedGroups, STORAGE_GROUPS_CHUNK_PREFIX);
  const tabChunks = chunkArrayForSync(tabs, STORAGE_TABS_CHUNK_PREFIX);
  const previousMetaResult = await chrome.storage.sync.get(STORAGE_META_KEY);
  const previousMeta = previousMetaResult?.[STORAGE_META_KEY] || {};
  const payload = {
    [STORAGE_META_KEY]: {
      groupChunkCount: groupChunks.length,
      tabChunkCount: tabChunks.length
    }
  };

  groupChunks.forEach((chunk, index) => {
    payload[createChunkKey(STORAGE_GROUPS_CHUNK_PREFIX, index)] = chunk;
  });

  tabChunks.forEach((chunk, index) => {
    payload[createChunkKey(STORAGE_TABS_CHUNK_PREFIX, index)] = chunk;
  });

  await chrome.storage.sync.set(payload);

  const staleKeys = [
    ...getChunkKeys(STORAGE_GROUPS_CHUNK_PREFIX, Math.max(0, Number(previousMeta.groupChunkCount || 0) - groupChunks.length)).map((_, offset) => createChunkKey(STORAGE_GROUPS_CHUNK_PREFIX, groupChunks.length + offset)),
    ...getChunkKeys(STORAGE_TABS_CHUNK_PREFIX, Math.max(0, Number(previousMeta.tabChunkCount || 0) - tabChunks.length)).map((_, offset) => createChunkKey(STORAGE_TABS_CHUNK_PREFIX, tabChunks.length + offset)),
    LEGACY_SYNC_GROUPS_KEY,
    LEGACY_SYNC_TABS_KEY
  ];

  if (staleKeys.length) {
    await chrome.storage.sync.remove(staleKeys);
  }

  if (canUseChromeLocalStorage()) {
    await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
  }
};

const persistGroups = async () => {
  if (isHydrating || !canUseChromeSyncStorage()) {
    return;
  }

  saveGroupsPromise = saveGroupsPromise
    .catch(() => {})
    .then(() => saveGroups());

  await saveGroupsPromise;
};

const loadGroups = async () => {
  if (!canUseChromeSyncStorage()) {
    groups.value = [];
    return;
  }

  const metaResult = await chrome.storage.sync.get(STORAGE_META_KEY);
  const syncMeta = metaResult?.[STORAGE_META_KEY];

  let nextGroups = [];
  let shouldMigrate = false;
  const hasChunkedSyncSnapshot = syncMeta
    && Number.isInteger(syncMeta.groupChunkCount)
    && Number.isInteger(syncMeta.tabChunkCount);

  if (hasChunkedSyncSnapshot) {
    const [storedGroups, storedTabs] = await Promise.all([
      loadChunkedCollection(STORAGE_GROUPS_CHUNK_PREFIX, Number(syncMeta.groupChunkCount || 0)),
      loadChunkedCollection(STORAGE_TABS_CHUNK_PREFIX, Number(syncMeta.tabChunkCount || 0))
    ]);

    nextGroups = hydrateGroupsFromCollections(storedGroups, storedTabs);
  } else {
    const legacySyncResult = await chrome.storage.sync.get([LEGACY_SYNC_GROUPS_KEY, LEGACY_SYNC_TABS_KEY]);
    const legacySyncGroups = legacySyncResult?.[LEGACY_SYNC_GROUPS_KEY];
    const legacySyncTabs = legacySyncResult?.[LEGACY_SYNC_TABS_KEY];

    nextGroups = hydrateGroupsFromCollections(legacySyncGroups, legacySyncTabs);
    shouldMigrate = nextGroups.length > 0;
  }

  if (!nextGroups.length && canUseChromeLocalStorage()) {
    const legacyResult = await chrome.storage.local.get(LEGACY_STORAGE_KEY);
    const legacyGroups = legacyResult?.[LEGACY_STORAGE_KEY];

    if (Array.isArray(legacyGroups) && legacyGroups.length) {
      nextGroups = legacyGroups.map((group, index) => normalizeGroup(group, index));
      shouldMigrate = true;
    }
  }

  isHydrating = true;
  groups.value = nextGroups;
  isHydrating = false;

  if (nextGroups.length && shouldMigrate) {
    await saveGroups();
  }
};

const syncGroupedTabsWithCurrentTabs = () => {
  const safeGroups = Array.isArray(groups.value) ? groups.value : [];
  const tabsById = new Map(
    currentTabs.value
      .filter((tab) => typeof tab.id === 'number')
      .map((tab) => [tab.id, normalizeTabSnapshot(tab)])
  );

  groups.value = safeGroups.map((group) => ({
    ...group,
    items: Array.isArray(group.items) ? group.items.map((item) => {
      if (item.tabId === null) {
        return item;
      }

      const liveTab = tabsById.get(item.tabId);

      return liveTab
        ? {
            ...item,
            ...liveTab,
            id: item.id
          }
        : item;
    }) : []
  }));
};

const refreshCurrentTabs = async () => {
  if (!canUseChromeTabs()) {
    currentTabs.value = [];
    return;
  }

  currentTabs.value = await chrome.tabs.query({ currentWindow: true });
  syncGroupedTabsWithCurrentTabs();
};

const registerPersistence = () => {
  if (persistenceRegistered) {
    return;
  }

  persistenceRegistered = true;

  watch(
    () => serializeWorkspace(),
    async () => {
      await persistGroups();
    },
    { deep: true }
  );
};

const refreshWorkspace = async () => {
  await Promise.all([loadGroups(), refreshCurrentTabs()]);
  isReady.value = true;
};

const registerChromeListeners = () => {
  if (chromeListenersRegistered || !canUseChromeTabs()) {
    return;
  }

  const handleTabChange = () => {
    refreshCurrentTabs();
  };

  chrome.tabs.onCreated.addListener(handleTabChange);
  chrome.tabs.onUpdated.addListener(handleTabChange);
  chrome.tabs.onRemoved.addListener(handleTabChange);
  chrome.tabs.onActivated.addListener(handleTabChange);

  chromeListenersRegistered = true;
};

const initializeWorkspace = async () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    registerPersistence();
    await refreshWorkspace();
    registerChromeListeners();
  })();

  return initializationPromise;
};

const togglePanel = async () => {
  await setPanelOpen(!isPanelOpen.value);
};

const setPanelOpen = async (nextOpen) => {
  const shouldOpen = Boolean(nextOpen);

  if (isPanelOpen.value === shouldOpen) {
    if (shouldOpen) {
      await refreshCurrentTabs();
    }

    return;
  }

  isPanelOpen.value = shouldOpen;

  if (shouldOpen) {
    await refreshCurrentTabs();
  }
};

const openPanel = async () => {
  await setPanelOpen(true);
};

const closePanel = async () => {
  await setPanelOpen(false);
};

const focusTab = async (tab) => {
  if (!canUseChromeTabs() || typeof tab.id !== 'number') {
    return;
  }

  await chrome.tabs.update(tab.id, { active: true });

  if (typeof chrome.windows?.update === 'function' && typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
};

const openSavedTab = async (tabItem) => {
  if (!canUseChromeTabs()) {
    return;
  }

  const targetUrl = tabItem?.url;

  if (!targetUrl || targetUrl === 'No URL') {
    return;
  }

  if (typeof tabItem?.tabId === 'number') {
    try {
      const existingTab = await chrome.tabs.get(tabItem.tabId);

      if (existingTab) {
        await focusTab(existingTab);
        return;
      }
    } catch {
      // Fall back to searching by URL below.
    }
  }

  const matchingTabs = await chrome.tabs.query({ url: targetUrl });
  const matchingTab = matchingTabs[0];

  if (matchingTab) {
    await focusTab(matchingTab);
    return;
  }

  const createdTab = await chrome.tabs.create({ url: targetUrl, active: true });

  if (createdTab) {
    await focusTab(createdTab);
  }
};

const getDragPayload = (event) => {
  const rawPayload = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain');

  if (!rawPayload) {
    return null;
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
};

const startTabDrag = () => {
  isDraggingTab.value = true;
};

const endTabDrag = () => {
  isDraggingTab.value = false;
};

const findGroupIndex = (groupId) => groups.value.findIndex((group) => group.id === groupId);

const ensureGroupItems = (group) => {
  if (!Array.isArray(group.items)) {
    group.items = [];
  }

  return group.items;
};

const createGroup = (name) => {
  const trimmedName = name.trim();

  groups.value.push({
    id: createId(),
    name: trimmedName || `Group ${groups.value.length + 1}`,
    isCollapsed: false,
    items: []
  });
};

const toggleGroupCollapsed = (groupId) => {
  const group = groups.value.find((entry) => entry.id === groupId);

  if (!group) {
    return;
  }

  group.isCollapsed = !group.isCollapsed;
};

const renameGroup = (groupId, name) => {
  const group = groups.value.find((entry) => entry.id === groupId);

  if (!group) {
    return;
  }

  const trimmedName = name.trim();
  group.name = trimmedName || group.name;
};

const insertItemIntoGroup = (groupId, item, targetIndex = null) => {
  const groupIndex = findGroupIndex(groupId);

  if (groupIndex === -1) {
    return;
  }

  const group = groups.value[groupIndex];
  const groupItems = ensureGroupItems(group);
  const insertionIndex = targetIndex === null ? groupItems.length : Math.max(0, Math.min(targetIndex, groupItems.length));
  groupItems.splice(insertionIndex, 0, item);
};

const findItemLocationByTabId = (tabId) => {
  for (const group of groups.value) {
    const groupItems = Array.isArray(group.items) ? group.items : [];
    const itemIndex = groupItems.findIndex((item) => item.tabId === tabId);

    if (itemIndex !== -1) {
      return { groupId: group.id, itemId: groupItems[itemIndex].id };
    }
  }

  return null;
};

const findItemLocationByUrl = (url) => {
  const normalizedUrl = normalizeUrlForComparison(url);

  if (!normalizedUrl) {
    return null;
  }

  for (const group of groups.value) {
    const groupItems = Array.isArray(group.items) ? group.items : [];
    const itemIndex = groupItems.findIndex((item) => normalizeUrlForComparison(item.url) === normalizedUrl);

    if (itemIndex !== -1) {
      return {
        groupId: group.id,
        itemId: groupItems[itemIndex].id
      };
    }
  }

  return null;
};

const groupContainsUrl = (groupId, url, excludeItemId = null) => {
  const group = groups.value.find((entry) => entry.id === groupId);

  if (!group) {
    return false;
  }

  const normalizedUrl = normalizeUrlForComparison(url);

  if (!normalizedUrl) {
    return false;
  }

  const groupItems = Array.isArray(group.items) ? group.items : [];

  return groupItems.some((item) => item.id !== excludeItemId && normalizeUrlForComparison(item.url) === normalizedUrl);
};

const findItemLocationByItemId = (itemId) => {
  for (const group of groups.value) {
    const groupItems = Array.isArray(group.items) ? group.items : [];
    const itemIndex = groupItems.findIndex((item) => item.id === itemId);

    if (itemIndex !== -1) {
      return {
        groupId: group.id,
        itemIndex
      };
    }
  }

  return null;
};

const moveGroupItem = (itemId, fromGroupId, toGroupId, targetIndex = null) => {
  const sourceGroupIndex = findGroupIndex(fromGroupId);
  const targetGroupIndex = findGroupIndex(toGroupId);

  if (sourceGroupIndex === -1 || targetGroupIndex === -1) {
    return;
  }

  const sourceGroup = groups.value[sourceGroupIndex];
  const sourceItems = ensureGroupItems(sourceGroup);
  const sourceItemIndex = sourceItems.findIndex((item) => item.id === itemId);

  if (sourceItemIndex === -1) {
    return;
  }

  const [movedItem] = sourceItems.splice(sourceItemIndex, 1);
  if (groupContainsUrl(toGroupId, movedItem.url, movedItem.id)) {
    sourceItems.splice(sourceItemIndex, 0, movedItem);
    return;
  }

  const targetGroup = groups.value[targetGroupIndex];
  const targetItems = ensureGroupItems(targetGroup);

  let insertionIndex = targetIndex === null ? targetItems.length : targetIndex;

  if (fromGroupId === toGroupId && sourceItemIndex < insertionIndex) {
    insertionIndex -= 1;
  }

  insertionIndex = Math.max(0, Math.min(insertionIndex, targetItems.length));
  targetItems.splice(insertionIndex, 0, movedItem);
};

const addTabToGroup = (groupId, tab, targetIndex = null) => {
  const tabSnapshot = normalizeTabSnapshot(tab);

  if (groupContainsUrl(groupId, tabSnapshot.url)) {
    return;
  }

  if (tabSnapshot.tabId !== null) {
    const existingLocation = findItemLocationByTabId(tabSnapshot.tabId);

    if (existingLocation) {
      moveGroupItem(existingLocation.itemId, existingLocation.groupId, groupId, targetIndex);
      return;
    }
  }

  const existingUrlLocation = findItemLocationByUrl(tabSnapshot.url);

  if (existingUrlLocation) {
    return;
  }

  insertItemIntoGroup(groupId, {
    id: createId(),
    ...tabSnapshot
  }, targetIndex);
};

const moveDraggedItem = (sourceItemId, fromGroupId, toGroupId, targetIndex = null) => {
  moveGroupItem(sourceItemId, fromGroupId, toGroupId, targetIndex);
};

const beginGroupItemDrag = (groupId, itemIndex) => {
  const group = groups.value.find((entry) => entry.id === groupId);
  const item = group?.items?.[itemIndex];

  if (!group || !item) {
    activeGroupItemDrag.value = null;
    return;
  }

  activeGroupItemDrag.value = {
    groupId,
    itemId: item.id,
    itemIndex,
    itemSnapshot: { ...item }
  };
};

const completeGroupItemDrag = () => {
  const activeDrag = activeGroupItemDrag.value;

  if (!activeDrag) {
    return;
  }

  const currentLocation = findItemLocationByItemId(activeDrag.itemId);

  if (!currentLocation) {
    const sourceGroup = groups.value.find((entry) => entry.id === activeDrag.groupId);

    if (sourceGroup) {
      const sourceItems = ensureGroupItems(sourceGroup);
      sourceItems.splice(
        Math.max(0, Math.min(activeDrag.itemIndex, sourceItems.length)),
        0,
        activeDrag.itemSnapshot
      );
    }
  }

  activeGroupItemDrag.value = null;
};

const moveGroup = (fromIndex, toIndex) => {
  if (fromIndex === toIndex) {
    return;
  }

  const [movedGroup] = groups.value.splice(fromIndex, 1);

  if (!movedGroup) {
    return;
  }

  groups.value.splice(toIndex, 0, movedGroup);
};

const deleteGroup = (groupId) => {
  const groupIndex = findGroupIndex(groupId);

  if (groupIndex === -1) {
    return;
  }

  groups.value.splice(groupIndex, 1);
};

const deleteGroupItem = (groupId, itemId) => {
  const groupIndex = findGroupIndex(groupId);

  if (groupIndex === -1) {
    return;
  }

  const group = groups.value[groupIndex];
  const groupItems = ensureGroupItems(group);
  const itemIndex = groupItems.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return;
  }

  groupItems.splice(itemIndex, 1);
};

export const useWorkspaceState = () => ({
  addTabToGroup,
  createGroup,
  beginGroupItemDrag,
  currentTabs,
  cloneTabForGroup,
  focusTab,
  getDragPayload,
  groups,
  initializeWorkspace,
  insertItemIntoGroup,
  isPanelOpen,
  isDraggingTab,
  isReady,
  completeGroupItemDrag,
  closePanel,
  deleteGroup,
  deleteGroupItem,
  moveGroup,
  moveDraggedItem,
  endTabDrag,
  openSavedTab,
  openPanel,
  renameGroup,
  startTabDrag,
  toggleGroupCollapsed,
  tabTitle,
  tabUrl,
  setPanelOpen,
  togglePanel
});