import { ref, watch } from 'vue';

const STORAGE_META_KEY = 'motion-workspace-sync-v3';
const STORAGE_GROUPS_CHUNK_PREFIX = 'motion-workspace-groups-v3-';
const STORAGE_TABS_CHUNK_PREFIX = 'motion-workspace-tabs-v3-';
const SETTINGS_STORAGE_KEY = 'motion-workspace-settings-v1';
const MOST_USED_TABS_STORAGE_KEY = 'motion-workspace-most-used-tabs-v1';
const SYNC_ITEM_BUDGET = 7600;
const MOST_USED_TABS_LIMIT = 12;
const DEFAULT_THEME = 'system';
const themeOptions = Object.freeze([
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]);

const currentTabs = ref([]);
const groups = ref([]);
const openTabsInNewPage = ref(true);
const hideTabListIndicator = ref(false);
const showRecentTabsOnSearchOpen = ref(true);
const mostUsedTabs = ref([]);
const showTooltips = ref(true);
const theme = ref(DEFAULT_THEME);
const isPanelOpen = ref(false);
const isDraggingTab = ref(false);
const isReady = ref(false);
const activeGroupItemDrag = ref(null);

let initializationPromise = null;
let persistenceRegistered = false;
let settingsPersistenceRegistered = false;
let chromeListenersRegistered = false;
let isHydrating = false;
let isHydratingSettings = false;
let saveGroupsPromise = Promise.resolve();
let saveSettingsPromise = Promise.resolve();
let lastTrackedUsageAtByUrl = new Map();
let systemThemeMediaQuery = null;
let systemThemeChangeHandler = null;
let themeShortcutHandler = null;
let systemThemeListenerRegistered = false;
let themeShortcutListenerRegistered = false;

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const issuedIds = new Set();
let nextIdCursor = Math.floor(Math.random() * 100000);

const canUseChromeTabs = () => typeof chrome !== 'undefined' && Boolean(chrome.tabs?.query);
const canUseChromeSyncStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
const canUseChromeLocalStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
const canUseWindowLocalStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

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

const normalizeUrlForUsage = (url) => {
  const normalizedUrl = normalizeUrlForComparison(url);

  if (!normalizedUrl || normalizedUrl.startsWith('chrome://newtab') || normalizedUrl === 'about:blank') {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }

    return parsedUrl.href;
  } catch {
    return normalizedUrl;
  }
};

const compareMostUsedTabs = (left, right) => Number(right.useCount || 0) - Number(left.useCount || 0) || Number(right.lastUsedAt || 0) - Number(left.lastUsedAt || 0);

const normalizeMostUsedTab = (item) => {
  const normalizedUrl = normalizeUrlForUsage(item?.url || item?.key);

  if (!normalizedUrl) {
    return null;
  }

  return {
    key: normalizedUrl,
    title: item?.title || 'Untitled tab',
    url: normalizedUrl,
    favIconUrl: resolveFavIconUrl(normalizedUrl, item?.favIconUrl || ''),
    useCount: Number.isFinite(item?.useCount) ? item.useCount : 0,
    lastUsedAt: Number.isFinite(item?.lastUsedAt) ? item.lastUsedAt : 0
  };
};

const sortAndLimitMostUsedTabs = (entries) => entries
  .filter(Boolean)
  .sort(compareMostUsedTabs)
  .slice(0, MOST_USED_TABS_LIMIT);

const resolveFavIconUrl = (url, fallback = '') => {
  if (fallback) {
    try {
      const fallbackUrl = new URL(fallback);

      if (['http:', 'https:', 'data:', 'blob:'].includes(fallbackUrl.protocol)) {
        return fallback;
      }
    } catch {
      // Fall through to generated favicon URL.
    }
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

const resolveTabFavIconUrl = (tab) => resolveFavIconUrl(tabUrl(tab), tab?.favIconUrl || '');
const resolveSavedItemFavIconUrl = (item) => resolveFavIconUrl(item?.url || 'No URL', item?.favIconUrl || '');

const normalizeTabSnapshot = (tab) => ({
  tabId: typeof tab.id === 'number' ? tab.id : null,
  windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
  title: tabTitle(tab),
  url: tabUrl(tab),
  favIconUrl: resolveTabFavIconUrl(tab)
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

const normalizeTheme = (value) => (themeOptions.some((option) => option.value === value) ? value : DEFAULT_THEME);

const applyTheme = (nextTheme = theme.value) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const resolvedTheme = nextTheme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : nextTheme;

  if (resolvedTheme === 'dark') {
    root.dataset.motionTheme = 'dark';
    return;
  }

  delete root.dataset.motionTheme;
};

const registerSystemThemeListener = () => {
  if (systemThemeListenerRegistered || typeof window === 'undefined' || !window.matchMedia) {
    return;
  }

  systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  systemThemeChangeHandler = () => {
    if (theme.value === 'system') {
      applyTheme();
    }
  };

  if (typeof systemThemeMediaQuery.addEventListener === 'function') {
    systemThemeMediaQuery.addEventListener('change', systemThemeChangeHandler);
  } else if (typeof systemThemeMediaQuery.addListener === 'function') {
    systemThemeMediaQuery.addListener(systemThemeChangeHandler);
  }

  systemThemeListenerRegistered = true;
};

const registerThemeShortcutListener = () => {
  if (themeShortcutListenerRegistered || typeof window === 'undefined') {
    return;
  }

  themeShortcutHandler = (event) => {
    if (event.repeat) {
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 't' || event.key === 'T')) {
      toggleTheme();
    }
  };

  window.addEventListener('keydown', themeShortcutHandler);

  themeShortcutListenerRegistered = true;
};
const serializeGroupCollection = (collection, tabs, tabIndexById) => collection.map((group) => {
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

  const serializedGroup = [
    group.id,
    group.name,
    Boolean(group.isCollapsed) ? 1 : 0,
    itemIndexes
  ];

  if (Array.isArray(group.groups) && group.groups.length) {
    serializedGroup.push(serializeGroupCollection(group.groups, tabs, tabIndexById));
  }

  return serializedGroup;
});

const hydrateGroupCollection = (storedGroups, storedTabs) => {
  if (!Array.isArray(storedGroups)) {
    return [];
  }

  const tabEntries = Array.isArray(storedTabs)
    ? storedTabs.map((entry) => normalizeStoredTabEntry(entry))
    : [];

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
          .map(normalizeGroupItem),
        groups: Array.isArray(group[4]) ? hydrateGroupsFromCollections(group[4], storedTabs) : []
      };
    }

    return {
      id: registerKnownId(group?.id) || createId(),
      name: (group?.name || '').trim() || `Group ${index + 1}`,
      isCollapsed: Boolean(group?.isCollapsed),
      items: Array.isArray(group?.items)
        ? group.items.map(normalizeGroupItem)
        : [],
      groups: Array.isArray(group?.groups)
        ? hydrateGroupCollection(group.groups, storedTabs)
        : []
    };
  });
};

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

  return {
    serializedGroups: serializeGroupCollection(groups.value, tabs, tabIndexById),
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
      items: Array.isArray(group?.items)
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
    ...getChunkKeys(STORAGE_TABS_CHUNK_PREFIX, Math.max(0, Number(previousMeta.tabChunkCount || 0) - tabChunks.length)).map((_, offset) => createChunkKey(STORAGE_TABS_CHUNK_PREFIX, tabChunks.length + offset))
  ];

  if (staleKeys.length) {
    await chrome.storage.sync.remove(staleKeys);
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
  const hasChunkedSyncSnapshot = syncMeta
    && Number.isInteger(syncMeta.groupChunkCount)
    && Number.isInteger(syncMeta.tabChunkCount);

  if (hasChunkedSyncSnapshot) {
    const [storedGroups, storedTabs] = await Promise.all([
      loadChunkedCollection(STORAGE_GROUPS_CHUNK_PREFIX, Number(syncMeta.groupChunkCount || 0)),
      loadChunkedCollection(STORAGE_TABS_CHUNK_PREFIX, Number(syncMeta.tabChunkCount || 0))
    ]);

    nextGroups = hydrateGroupsFromCollections(storedGroups, storedTabs);
  }

  isHydrating = true;
  groups.value = nextGroups;
  isHydrating = false;
};

const loadSettings = async () => {
  if (!canUseChromeLocalStorage()) {
    applyTheme();
    return;
  }

  const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const storedValue = result?.[SETTINGS_STORAGE_KEY];
  const storedSettings = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
    ? storedValue
    : null;

  isHydratingSettings = true;
  openTabsInNewPage.value = storedSettings ? storedSettings.openTabsInNewPage !== false : storedValue !== false;
  hideTabListIndicator.value = storedSettings ? storedSettings.hideTabListIndicator === true : false;
  showRecentTabsOnSearchOpen.value = storedSettings ? storedSettings.showRecentTabsOnSearchOpen !== false : true;
  showTooltips.value = storedSettings ? storedSettings.showTooltips !== false : true;
  theme.value = normalizeTheme(storedSettings?.theme);
  isHydratingSettings = false;
  applyTheme(theme.value);
};

const loadMostUsedTabs = async () => {
  let storedEntries = [];

  if (canUseWindowLocalStorage()) {
    try {
      const storedValue = window.localStorage.getItem(MOST_USED_TABS_STORAGE_KEY);

      if (storedValue) {
        const parsedValue = JSON.parse(storedValue);

        if (Array.isArray(parsedValue)) {
          storedEntries = parsedValue;
        }
      }
    } catch {
      storedEntries = [];
    }
  }

  if (!storedEntries.length && canUseChromeLocalStorage()) {
    const result = await chrome.storage.local.get(MOST_USED_TABS_STORAGE_KEY);
    storedEntries = Array.isArray(result?.[MOST_USED_TABS_STORAGE_KEY]) ? result[MOST_USED_TABS_STORAGE_KEY] : [];
  }

  mostUsedTabs.value = sortAndLimitMostUsedTabs(storedEntries.map(normalizeMostUsedTab));

  if (storedEntries.length && canUseWindowLocalStorage()) {
    try {
      window.localStorage.setItem(MOST_USED_TABS_STORAGE_KEY, JSON.stringify(mostUsedTabs.value));
    } catch {
      // Ignore storage quota or availability errors.
    }
  }
};

const saveMostUsedTabs = async () => {
  if (canUseWindowLocalStorage()) {
    try {
      if (!mostUsedTabs.value.length) {
        window.localStorage.removeItem(MOST_USED_TABS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(MOST_USED_TABS_STORAGE_KEY, JSON.stringify(mostUsedTabs.value));
      }
    } catch {
      // Ignore storage quota or availability errors.
    }
  }

  if (!canUseChromeLocalStorage()) {
    return;
  }

  if (!mostUsedTabs.value.length) {
    await chrome.storage.local.remove(MOST_USED_TABS_STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({
    [MOST_USED_TABS_STORAGE_KEY]: mostUsedTabs.value
  });
};

const persistMostUsedTabs = async () => {
  if (!canUseChromeLocalStorage()) {
    return;
  }

  await saveMostUsedTabs();
};

const trackMostUsedTab = async (tabItem) => {
  const normalizedUrl = normalizeUrlForUsage(tabItem?.url);

  if (!normalizedUrl) {
    return;
  }

  const now = Date.now();
  const lastTrackedAt = lastTrackedUsageAtByUrl.get(normalizedUrl) || 0;

  if (now - lastTrackedAt < 1500) {
    return;
  }

  lastTrackedUsageAtByUrl.set(normalizedUrl, now);

  const nextEntry = {
    key: normalizedUrl,
    title: tabTitle(tabItem),
    url: normalizedUrl,
    favIconUrl: resolveFavIconUrl(normalizedUrl, tabItem?.favIconUrl || ''),
    useCount: 1,
    lastUsedAt: Date.now()
  };

  const nextEntries = mostUsedTabs.value.filter((entry) => entry.key !== normalizedUrl);
  const existingEntry = mostUsedTabs.value.find((entry) => entry.key === normalizedUrl);

  if (existingEntry) {
    nextEntry.useCount = Number(existingEntry.useCount || 0) + 1;
  }

  mostUsedTabs.value = sortAndLimitMostUsedTabs([nextEntry, ...nextEntries]);
  await persistMostUsedTabs();
};

// per-item removal intentionally removed — keep only clearMostUsedTabs for managing history

const clearMostUsedTabs = async () => {
  mostUsedTabs.value = [];
  lastTrackedUsageAtByUrl.clear();
  if (canUseWindowLocalStorage()) {
    try {
      window.localStorage.removeItem(MOST_USED_TABS_STORAGE_KEY);
    } catch {
      // Ignore storage quota or availability errors.
    }
  }
  await persistMostUsedTabs();
};

const saveSettings = async () => {
  if (!canUseChromeLocalStorage()) {
    return;
  }

  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: {
      openTabsInNewPage: openTabsInNewPage.value,
      hideTabListIndicator: hideTabListIndicator.value,
      showTooltips: showTooltips.value,
      showRecentTabsOnSearchOpen: showRecentTabsOnSearchOpen.value,
      theme: theme.value
    }
  });
};

const persistSettings = async () => {
  if (isHydratingSettings || !canUseChromeLocalStorage()) {
    return;
  }

  saveSettingsPromise = saveSettingsPromise
    .catch(() => {})
    .then(() => saveSettings());

  await saveSettingsPromise;
};

const syncGroupedTabsWithCurrentTabs = () => {
  const tabsById = new Map(
    currentTabs.value
      .filter((tab) => typeof tab.id === 'number')
      .map((tab) => [tab.id, normalizeTabSnapshot(tab)])
  );

  const syncGroupCollection = (collection) => collection.map((group) => ({
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
    }) : [],
    groups: Array.isArray(group.groups) ? syncGroupCollection(group.groups) : []
  }));

  groups.value = syncGroupCollection(groups.value);
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

const registerSettingsPersistence = () => {
  if (settingsPersistenceRegistered) {
    return;
  }

  settingsPersistenceRegistered = true;

  watch(
    () => [openTabsInNewPage.value, hideTabListIndicator.value, showRecentTabsOnSearchOpen.value, showTooltips.value],
    async () => {
      await persistSettings();
    },
    { flush: 'sync' }
  );
};

const toggleShowTooltips = () => {
  showTooltips.value = !showTooltips.value;
  void persistSettings();
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

  const handleTabActivated = async (activeInfo) => {
    refreshCurrentTabs();

    try {
      const activeTab = await chrome.tabs.get(activeInfo.tabId);

      if (activeTab) {
        await trackMostUsedTab(activeTab);
      }
    } catch {
      // Ignore tabs that disappear before we can record them.
    }
  };

  const handleTabUpdated = async (tabId, changeInfo, tab) => {
    refreshCurrentTabs();

    if (changeInfo.status !== 'complete' && !changeInfo.url) {
      return;
    }

    try {
      const liveTab = tab || await chrome.tabs.get(tabId);

      if (liveTab?.active) {
        await trackMostUsedTab(liveTab);
      }
    } catch {
      // Ignore tabs that are gone or inaccessible.
    }
  };

  chrome.tabs.onCreated.addListener(handleTabChange);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabChange);
  chrome.tabs.onActivated.addListener(handleTabActivated);

  chromeListenersRegistered = true;
};

const initializeWorkspace = async () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    registerPersistence();
    registerSystemThemeListener();
    registerThemeShortcutListener();
    await Promise.all([loadSettings(), loadMostUsedTabs(), refreshWorkspace()]);
    registerChromeListeners();
  })();

  return initializationPromise;
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

const toggleOpenTabsInNewPage = () => {
  openTabsInNewPage.value = !openTabsInNewPage.value;
  void persistSettings();
};

const toggleHideTabListIndicator = () => {
  hideTabListIndicator.value = !hideTabListIndicator.value;
  void persistSettings();
};

const toggleShowRecentTabsOnSearchOpen = () => {
  showRecentTabsOnSearchOpen.value = !showRecentTabsOnSearchOpen.value;
  void persistSettings();
};

const setTheme = (nextTheme) => {
  const normalizedTheme = normalizeTheme(nextTheme);

  if (theme.value === normalizedTheme) {
    return;
  }

  theme.value = normalizedTheme;
  applyTheme(normalizedTheme);
  void persistSettings();
};

const toggleTheme = () => {
  const nextTheme = theme.value === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
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
        await trackMostUsedTab(tabItem);
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
    await trackMostUsedTab(tabItem);
    return;
  }

  if (!openTabsInNewPage.value) {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = activeTabs[0];

    if (activeTab?.id) {
      await chrome.tabs.update(activeTab.id, { url: targetUrl, active: true });

      if (typeof chrome.windows?.update === 'function' && typeof activeTab.windowId === 'number') {
        await chrome.windows.update(activeTab.windowId, { focused: true });
      }

      await trackMostUsedTab(tabItem);
      return;
    }
  }

  await chrome.tabs.create({ url: targetUrl, active: false });
  await trackMostUsedTab(tabItem);
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

const ensureGroupItems = (group) => {
  if (!Array.isArray(group.items)) {
    group.items = [];
  }

  return group.items;
};

const findGroupIndex = (groupId) => groups.value.findIndex((group) => group.id === groupId);

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
  mostUsedTabs,
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
  openTabsInNewPage,
  hideTabListIndicator,
  showRecentTabsOnSearchOpen,
  openPanel,
  renameGroup,
  startTabDrag,
  theme,
  themeOptions,
  setTheme,
  toggleTheme,
  toggleOpenTabsInNewPage,
  toggleHideTabListIndicator,
  toggleShowRecentTabsOnSearchOpen,
  showTooltips,
  toggleShowTooltips,
  clearMostUsedTabs,
  toggleGroupCollapsed,
  tabTitle,
  tabUrl,
  resolveTabFavIconUrl,
  resolveSavedItemFavIconUrl,
  setPanelOpen,
});

applyTheme();