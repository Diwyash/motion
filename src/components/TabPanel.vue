<template>
  <div
    ref="hitAreaRef"
    class="tab-panel-hit-area"
    aria-hidden="true"
    @mouseenter="handleHoverEnter"
    @mouseleave="handleHoverLeave"
  />

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

    <p v-if="!currentTabs.length" class="tab-panel__empty">No tabs found.</p>

    <Draggable
      v-else
      v-model="currentTabs"
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
            v-if="tab.favIconUrl"
            class="tab-list__icon"
            :src="tab.favIconUrl"
            :alt="`${tabTitle(tab)} icon`"
            loading="lazy"
            referrerpolicy="no-referrer"
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
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Draggable from 'vuedraggable';
import { useWorkspaceState } from '../composables/useWorkspaceState';

const closeTimer = ref(null);
const panelRef = ref(null);
const hitAreaRef = ref(null);

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
  tabTitle,
  tabUrl,
  togglePanel
} = useWorkspaceState();

void initializeWorkspace();

const handleKeydown = (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key.toLowerCase() === 'p') {
    event.preventDefault();
    togglePanel();
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

const handleHoverEnter = async () => {
  if (isDraggingTab.value) {
    return;
  }

  clearCloseTimer();
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

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pointerdown', handlePointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pointerdown', handlePointerDown, true);
  clearCloseTimer();
});
</script>

<style lang="scss" scoped src="./TabPanel.scss"></style>