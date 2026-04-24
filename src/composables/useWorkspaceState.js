import { ref, watch } from 'vue';

const STORAGE_KEY = 'motion-workspace-v1';

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

const canUseChromeTabs = () => typeof chrome !== 'undefined' && Boolean(chrome.tabs?.query);
const canUseChromeStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `motion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

const normalizeTabSnapshot = (tab) => ({
  tabId: typeof tab.id === 'number' ? tab.id : null,
  windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
  title: tabTitle(tab),
  url: tabUrl(tab),
  favIconUrl: tab.favIconUrl || ''
});

const cloneTabForGroup = (tab) => ({
  id: createId(),
  ...normalizeTabSnapshot(tab)
});

const normalizeGroupItem = (item) => ({
  id: item.id || createId(),
  tabId: typeof item.tabId === 'number' ? item.tabId : null,
  windowId: typeof item.windowId === 'number' ? item.windowId : null,
  title: item.title || 'Untitled tab',
  url: item.url || 'No URL',
  favIconUrl: item.favIconUrl || ''
});

const normalizeGroup = (group, index) => ({
  id: group.id || createId(),
  name: (group.name || '').trim() || `Group ${index + 1}`,
  isCollapsed: Boolean(group.isCollapsed),
  items: Array.isArray(group.items) ? group.items.map(normalizeGroupItem) : []
});

const serializeGroups = () => groups.value.map((group) => ({
  id: group.id,
  name: group.name,
  isCollapsed: Boolean(group.isCollapsed),
  items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : []
}));

const saveGroups = async () => {
  if (!canUseChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: serializeGroups() });
};

const loadGroups = async () => {
  if (!canUseChromeStorage()) {
    groups.value = [];
    return;
  }

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const storedGroups = result?.[STORAGE_KEY];

  isHydrating = true;
  groups.value = Array.isArray(storedGroups)
    ? storedGroups.map((group, index) => normalizeGroup(group, index))
    : [];
  isHydrating = false;
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
    groups,
    async () => {
      if (isHydrating) {
        return;
      }

      await saveGroups();
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