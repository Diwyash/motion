<template>
  <button
    ref="hitAreaRef"
    class="tab-panel-hit-area"
    :class="{ 'tab-panel-hit-area--open': isOpen, 'tab-panel-hit-area--overlay-active': isOverlayActive }"
    type="button"
    aria-label="Open tabs panel"
    @mouseenter="handleHoverEnter"
    @mouseleave="handleHoverLeave"
    @click="openPanel"
  >
    <span v-if="!hideTabListIndicator" class="tab-panel-hit-area__indicator" aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 6.75A1.25 1.25 0 0 1 6.25 5.5h11.5a1.25 1.25 0 0 1 0 2.5H6.25A1.25 1.25 0 0 1 5 6.75Zm0 5.25a1.25 1.25 0 0 1 1.25-1.25h11.5a1.25 1.25 0 0 1 0 2.5H6.25A1.25 1.25 0 0 1 5 12Zm0 5.25A1.25 1.25 0 0 1 6.25 16h11.5a1.25 1.25 0 0 1 0 2.5H6.25A1.25 1.25 0 0 1 5 17.25Z" />
      </svg>
    </span>
  </button>

  <aside
    ref="panelRef"
    class="tab-panel"
    :class="{ 'tab-panel--open': isOpen, 'tab-panel--dragging': isDraggingTab }"
    aria-label="Open tabs panel"
    @mouseenter="handleHoverEnter"
    @mouseleave="handleHoverLeave"
  >
    <div class="tab-panel__header">
      <div>
        <p class="tab-panel__eyebrow">Browser tabs</p>
      </div>
    </div>

    <p v-if="!visibleTabs.length" class="tab-panel__empty">No tabs found.</p>

    <Draggable
      v-else
      :list="visibleTabs"
      class="tab-list"
      item-key="id"
      :clone="cloneTabForGroup"
      :animation="160"
      :group="{ name: 'motion-tabs', pull: 'clone', put: false }"
      :sort="false"
      @start="handleDragStart"
      @end="handleDragEnd"
    >
      <template #item="{ element: tab }">
        <button class="tab-list__item" type="button" @click="focusTab(tab)">
          <img
            v-if="getTabIconSrc(tab)"
            class="tab-list__icon"
            :src="getTabIconSrc(tab)"
            :alt="`${tabTitle(tab)} icon`"
            loading="lazy"
            @error="handleTabIconError(tab)"
          />
          <span v-else class="tab-list__icon tab-list__icon--fallback" aria-hidden="true" />

          <span class="tab-list__content">
            <span class="tab-list__title">{{ tabTitle(tab) }}</span>
            <span class="tab-list__url">{{ tabUrl(tab) }}</span>
          </span>
        </button>
      </template>
    </Draggable>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Draggable from 'vuedraggable';
import { useWorkspaceState } from '../composables/useWorkspaceState';

const closeTimer = ref(null);
const panelRef = ref(null);
const hitAreaRef = ref(null);
const isOverlayActive = ref(false);
const CLOSE_OVERLAYS_EVENT = 'motion:close-overlays';
const OVERLAY_STATE_EVENT = 'motion:overlay-state';

const {
  currentTabs,
  closePanel,
  focusTab,
  initializeWorkspace,
  isPanelOpen: isOpen,
  isDraggingTab,
  endTabDrag,
  cloneTabForGroup,
  openPanel,
  startTabDrag,
  hideTabListIndicator,
  resolveTabFavIconUrl,
  tabTitle,
  tabUrl,
} = useWorkspaceState();

const visibleTabs = computed(() => currentTabs.value.filter((tab) => !tab.active));
const brokenTabIcons = ref(new Set());

void initializeWorkspace();

const handleKeydown = (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    clearCloseTimer();
    closePanel();
  }
};

const clearCloseTimer = () => {
  if (closeTimer.value !== null) {
    window.clearTimeout(closeTimer.value);
    closeTimer.value = null;
  }
};

const handleTabIconError = (tab) => {
  const iconKey = tab?.id ?? tabUrl(tab);

  if (iconKey !== null && iconKey !== undefined) {
    const nextBrokenIcons = new Set(brokenTabIcons.value);
    nextBrokenIcons.add(String(iconKey));
    brokenTabIcons.value = nextBrokenIcons;
  }
};

const getTabIconSrc = (tab) => {
  const iconKey = tab?.id ?? tabUrl(tab);

  if (iconKey !== null && iconKey !== undefined && brokenTabIcons.value.has(String(iconKey))) {
    return '';
  }

  return resolveTabFavIconUrl(tab);
};

const handleHoverEnter = async () => {
  if (isDraggingTab.value) {
    return;
  }

  clearCloseTimer();
  window.dispatchEvent(new CustomEvent(CLOSE_OVERLAYS_EVENT));
  await openPanel();
};

const handleHoverLeave = () => {
  if (isDraggingTab.value) {
    return;
  }

  clearCloseTimer();
  closeTimer.value = window.setTimeout(() => {
    closePanel();
  }, 300);
};

const handleDragStart = () => {
  clearCloseTimer();
  startTabDrag();
  closePanel();
};

const handleDragEnd = () => {
  endTabDrag();
};

const handlePointerDown = (event) => {
  if (!isOpen.value) {
    return;
  }

  const target = event.target;
  const panelElement = panelRef.value;
  const hitAreaElement = hitAreaRef.value;

  if (panelElement?.contains(target) || hitAreaElement?.contains(target)) {
    return;
  }

  clearCloseTimer();
  closePanel();
};

const handleOverlayState = (event) => {
  isOverlayActive.value = Boolean(event?.detail?.isOpen);
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener(OVERLAY_STATE_EVENT, handleOverlayState);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pointerdown', handlePointerDown, true);
  window.removeEventListener(OVERLAY_STATE_EVENT, handleOverlayState);
  clearCloseTimer();
});
</script>

<style lang="scss" scoped src="./TabPanel.scss"></style>