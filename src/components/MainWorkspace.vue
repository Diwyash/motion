<template>
  <section class="main-workspace" aria-label="Workspace">
    <div class="main-workspace__shell">
      <div class="main-workspace__panes">
        <section class="main-workspace__groups-pane" aria-label="Groups">
          <Draggable
            v-if="groups.length"
            v-model="groups"
            class="group-grid"
            item-key="id"
            :animation="160"
            handle=".group-card__drag-handle"
            :group="groupBoardDragOptions"
          >
            <template #item="{ element: group, index }">
            <article
              class="group-card"
              :class="{
                'group-card--selected': selectedGroupId === group.id,
                'group-card--collapsed': group.isCollapsed,
                'group-card--expanded': !group.isCollapsed
              }"
              :ref="(element) => setGroupCardRef(group.id, element)"
            >
              <header class="group-card__header">
                <button class="group-card__drag-handle" type="button" :aria-label="showGroupShortcutHints && index < 9 ? `Alt+${index + 1} shortcut` : 'Reorder group'">
                  <span
                    v-if="showGroupShortcutHints && index < 9"
                    class="group-card__header-shortcut"
                    aria-hidden="true"
                  >{{ index + 1 }}</span>
                  <span v-else class="group-card__drag-icon" aria-hidden="true" />
                </button>
                <h3
                  v-if="editingGroupId !== group.id"
                  class="group-card__title"
                  @dblclick="openGroupEditPopup(group)"
                >
                  {{ group.name }}
                </h3>
                <input
                  v-else
                  ref="groupEditNameInput"
                  v-model="editingGroupName"
                  class="group-card__title-input"
                  type="text"
                  @keydown.enter.prevent="submitGroupEditPopup"
                  @keydown.esc.prevent="closeGroupEditPopup"
                />
                <button class="group-card__collapse-button" type="button" aria-label="Toggle group collapse" @click="toggleGroupCollapsed(group.id)" />
                <button class="group-card__delete-button" type="button" aria-label="Delete group" @click="requestDeleteGroup(group)" />
              </header>

              <Draggable
                v-if="!group.isCollapsed"
                v-model="group.items"
                class="group-card__list"
                item-key="id"
                :animation="160"
                :group="groupItemDragOptions"
                :move="allowGroupItemDrop"
                @add="handleGroupItemAdd(group.id, $event)"
                @start="handleGroupItemDragStart(group.id, $event.oldIndex)"
                @end="completeGroupItemDrag"
              >
                <template #item="{ element: item, index }">
                  <div
                    class="group-card__item"
                    :class="{ 'group-card__item--selected': selectedGroupId === group.id && selectedTabId === item.id }"
                    :ref="(element) => setGroupItemRef(group.id, item.id, element)"
                    @click="handleGroupItemClick(group.id, item)"
                    @dblclick="openEditPopup(group.id, item)"
                  >
                    <template v-if="selectedGroupId === group.id">
                      <span
                        v-if="index < 9"
                        class="group-card__item-shortcut"
                        :aria-label="`Shortcut ${index + 1}`"
                      >{{ index + 1 }}</span>
                      <span v-else class="group-card__item-shortcut group-card__item-shortcut--empty" aria-hidden="true" />
                    </template>
                    <img
                      v-else-if="item.favIconUrl"
                      class="group-card__item-icon"
                      :src="item.favIconUrl"
                      :alt="`${item.title} icon`"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <span v-else class="group-card__item-icon group-card__item-icon--fallback" aria-hidden="true" />

                    <span class="group-card__item-title">{{ item.title }}</span>
                    <button class="group-card__delete-button group-card__delete-button--inline" type="button" aria-label="Delete tab" @click.stop="deleteTabFromGroup(group.id, item.id)" />
                  </div>
                </template>

                <template #footer>
                  <div v-if="!Array.isArray(group.items) || !group.items.length" class="group-card__empty">Drop tabs here</div>
                </template>
              </Draggable>
            </article>
            </template>
          </Draggable>

          <div v-else class="main-workspace__empty-state">
            Create your first group, then drag tabs from the panel into it.
          </div>
        </section>

        <aside class="main-workspace__future-pane" aria-label="Future content">
          <div class="main-workspace__future-card">
            <p class="main-workspace__eyebrow">Future content</p>
            <h3 class="main-workspace__future-title">Reserved panel</h3>
            <p class="main-workspace__future-copy">This area is reserved for the next section of the dashboard.</p>
          </div>
        </aside>
      </div>

      <button class="main-workspace__fab" type="button" @click="openGroupPopup">Create group</button>

      <div v-if="isCreatePopupOpen" class="group-popup-backdrop" @click.self="closeGroupPopup">
        <form class="group-popup" @submit.prevent="submitGroupPopup">
          <div class="group-popup__header">
            <p class="group-popup__title">New group</p>
            <div class="group-popup__actions">
              <button class="group-popup__button group-popup__button--cancel" type="button" aria-label="Cancel" @click="closeGroupPopup" />
              <button class="group-popup__button group-popup__button--primary" type="submit" aria-label="Create group" />
            </div>
          </div>
          <input
            ref="groupNameInput"
            v-model="groupName"
            class="group-popup__input"
            type="text"
            placeholder="Group name"
            aria-label="Group name"
          />
        </form>
      </div>

      <div v-if="isEditPopupOpen" class="group-popup-backdrop" @click.self="closeEditPopup">
        <form class="group-popup" @submit.prevent="submitEditPopup">
          <div class="group-popup__header">
            <p class="group-popup__title">Edit tab</p>
            <div class="group-popup__actions">
              <button class="group-popup__button group-popup__button--cancel" type="button" aria-label="Cancel" @click="closeEditPopup" />
              <button class="group-popup__button group-popup__button--primary" type="submit" aria-label="Save changes" />
            </div>
          </div>
          <input
            ref="editTabNameInput"
            v-model="editTabName"
            class="group-popup__input"
            type="text"
            placeholder="Tab name"
            aria-label="Tab name"
          />
          <input
            v-model="editTabUrl"
            class="group-popup__input group-popup__input--spaced"
            type="text"
            placeholder="Tab url"
            aria-label="Tab url"
          />
        </form>
      </div>

      <div v-if="isGroupEditPopupOpen" class="group-popup-backdrop" @click.self="closeGroupEditPopup">
        <form class="group-popup" @submit.prevent="submitGroupEditPopup">
          <div class="group-popup__header">
            <p class="group-popup__title">Rename</p>
            <div class="group-popup__actions">
              <button class="group-popup__button group-popup__button--cancel" type="button" aria-label="Cancel" @click="closeGroupEditPopup" />
              <button class="group-popup__button group-popup__button--primary" type="submit" aria-label="Rename group" />
            </div>
          </div>
          <input
            ref="groupEditNameInput"
            v-model="editingGroupName"
            class="group-popup__input"
            type="text"
            placeholder="Group name"
            aria-label="Group name"
          />
        </form>
      </div>

      <div v-if="isDeleteGroupPopupOpen" class="group-popup-backdrop" @click.self="closeDeleteGroupPopup">
        <form class="group-popup" @submit.prevent="confirmDeleteAction">
          <div class="group-popup__header">
            <p class="group-popup__title">Delete</p>
            <div class="group-popup__actions">
              <button class="group-popup__button group-popup__button--cancel" type="button" aria-label="No, cancel delete" @click="closeDeleteGroupPopup" />
              <button class="group-popup__button group-popup__button--primary" type="submit" :aria-label="deleteTargetType === 'tab' ? 'Yes, delete tab' : 'Yes, delete group'" />
            </div>
          </div>
          <p class="group-popup__message">{{ deleteConfirmationMessage }}</p>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, nextTick, ref } from 'vue';
import Draggable from 'vuedraggable';
import { useWorkspaceState } from '../composables/useWorkspaceState';

const groupName = ref('');
const isCreatePopupOpen = ref(false);
const groupNameInput = ref(null);
const isEditPopupOpen = ref(false);
const editTabNameInput = ref(null);
const editTabName = ref('');
const editTabUrl = ref('');
const editTargetGroupId = ref('');
const editTargetItemId = ref('');
const isGroupEditPopupOpen = ref(false);
const groupEditNameInput = ref(null);
const editingGroupId = ref('');
const editingGroupName = ref('');
const isDeleteGroupPopupOpen = ref(false);
const deleteTargetType = ref('group');
const deleteTargetGroupId = ref('');
const deleteTargetGroupName = ref('');
const deleteTargetItemId = ref('');
const deleteTargetItemTitle = ref('');
const selectedGroupId = ref('');
const selectedTabId = ref('');
const autoExpandedGroupId = ref('');
const selectionTimeoutId = ref(null);
const isAltPressed = ref(false);

const groupCardElements = new Map();
const groupItemElements = new Map();

const {
  beginGroupItemDrag,
  createGroup,
  deleteGroup,
  deleteGroupItem,
  groups,
  initializeWorkspace,
  completeGroupItemDrag,
  openSavedTab,
  renameGroup,
  toggleGroupCollapsed
} = useWorkspaceState();

const groupBoardDragOptions = {
  name: 'motion-groups',
  pull: true,
  put: false
};

const groupItemDragOptions = {
  name: 'motion-tabs',
  pull: true,
  put: ['motion-tabs']
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

const setGroupCardRef = (groupId, element) => {
  if (element) {
    groupCardElements.set(groupId, element);
    return;
  }

  groupCardElements.delete(groupId);
};

const setGroupItemRef = (groupId, itemId, element) => {
  const elementKey = `${groupId}:${itemId}`;

  if (element) {
    groupItemElements.set(elementKey, element);
    return;
  }

  groupItemElements.delete(elementKey);
};

const hasOpenPopup = () => isCreatePopupOpen.value || isEditPopupOpen.value || isGroupEditPopupOpen.value || isDeleteGroupPopupOpen.value;

const clearSelectionInactivityTimer = () => {
  if (selectionTimeoutId.value !== null) {
    window.clearTimeout(selectionTimeoutId.value);
    selectionTimeoutId.value = null;
  }
};

const resetSelectionInactivityTimer = () => {
  clearSelectionInactivityTimer();

  if (!selectedGroupId.value && !selectedTabId.value) {
    return;
  }

  selectionTimeoutId.value = window.setTimeout(() => {
    if (hasOpenPopup()) {
      resetSelectionInactivityTimer();
      return;
    }

    clearSelection();
  }, 3000);
};

const collapseAutoExpandedGroup = (exceptGroupId = '') => {
  if (!autoExpandedGroupId.value || autoExpandedGroupId.value === exceptGroupId) {
    return;
  }

  const group = groups.value.find((entry) => entry.id === autoExpandedGroupId.value);

  if (group && !group.isCollapsed) {
    group.isCollapsed = true;
  }

  autoExpandedGroupId.value = '';
};

const ensureSelectedGroupVisible = (group) => {
  if (!group) {
    return;
  }

  if (group.isCollapsed) {
    group.isCollapsed = false;
    autoExpandedGroupId.value = group.id;
    return;
  }

  if (autoExpandedGroupId.value === group.id) {
    autoExpandedGroupId.value = '';
  }
};

const setSelectedGroup = (groupId) => {
  if (selectedGroupId.value !== groupId) {
    collapseAutoExpandedGroup(groupId);
  }

  selectedGroupId.value = groupId;
  ensureSelectedGroupVisible(getSelectedGroup());
  resetSelectionInactivityTimer();
};

const clearSelection = () => {
  clearSelectionInactivityTimer();
  collapseAutoExpandedGroup();
  selectedGroupId.value = '';
  selectedTabId.value = '';
};

const getSelectedGroup = () => groups.value.find((entry) => entry.id === selectedGroupId.value) || null;

const getSelectedTab = () => {
  const selectedGroup = getSelectedGroup();

  if (!selectedGroup || !selectedTabId.value) {
    return null;
  }

  return Array.isArray(selectedGroup.items)
    ? selectedGroup.items.find((entry) => entry.id === selectedTabId.value) || null
    : null;
};

const deleteConfirmationMessage = computed(() => {
  if (deleteTargetType.value === 'tab') {
    return `Delete ${deleteTargetItemTitle.value || 'this tab'}?`;
  }

  return `Delete ${deleteTargetGroupName.value} and its tabs?`;
});

const showGroupShortcutHints = computed(() => isAltPressed.value && !hasOpenPopup());

const scrollSelectedGroupIntoView = async (groupId) => {
  await nextTick();
  groupCardElements.get(groupId)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
};

const scrollSelectedTabIntoView = async (groupId, itemId) => {
  await nextTick();
  groupItemElements.get(`${groupId}:${itemId}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
};

const selectGroupByShortcut = async (shortcutIndex) => {
  const group = groups.value[shortcutIndex];

  if (!group) {
    return;
  }

  setSelectedGroup(group.id);
  selectedTabId.value = '';
  await scrollSelectedGroupIntoView(group.id);
};

const selectTabByShortcut = async (shortcutIndex) => {
  const selectedGroup = getSelectedGroup();

  if (!selectedGroup) {
    return;
  }

  ensureSelectedGroupVisible(selectedGroup);

  const groupItems = Array.isArray(selectedGroup.items) ? selectedGroup.items : [];
  const selectedItem = groupItems[shortcutIndex];

  if (!selectedItem) {
    return;
  }

  selectedTabId.value = selectedItem.id;
  resetSelectionInactivityTimer();
  await scrollSelectedTabIntoView(selectedGroup.id, selectedItem.id);
};

const openSelectedTab = async () => {
  const selectedItem = getSelectedTab();

  if (selectedItem) {
    await openSavedTab(selectedItem);
    clearSelection();
  }
};

const editSelectedItem = () => {
  const selectedTab = getSelectedTab();

  if (selectedTab && selectedGroupId.value) {
    void openEditPopup(selectedGroupId.value, selectedTab);
    return;
  }

  const selectedGroup = getSelectedGroup();

  if (selectedGroup) {
    void openGroupEditPopup(selectedGroup);
  }
};

const toggleSelectedGroupCollapse = () => {
  const selectedGroup = getSelectedGroup();

  if (!selectedGroup) {
    return;
  }

  toggleGroupCollapsed(selectedGroup.id);

  if (selectedGroup.isCollapsed) {
    if (autoExpandedGroupId.value === selectedGroup.id) {
      autoExpandedGroupId.value = '';
    }
    selectedTabId.value = '';
  }
};

const handleGroupItemClick = async (groupId, item) => {
  setSelectedGroup(groupId);
  selectedTabId.value = item.id;
  resetSelectionInactivityTimer();
  await openSavedTab(item);
  clearSelection();
};

const shouldIgnoreWorkspaceShortcut = (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

const handlePointerDown = (event) => {
  if (hasOpenPopup()) {
    return;
  }

  if (!selectedGroupId.value && !selectedTabId.value) {
    return;
  }

  const target = event.target;

  if (!(target instanceof Node)) {
    return;
  }

  const selectedItemElement = selectedGroupId.value && selectedTabId.value
    ? groupItemElements.get(`${selectedGroupId.value}:${selectedTabId.value}`)
    : null;

  if (selectedItemElement?.contains(target)) {
    resetSelectionInactivityTimer();
    return;
  }

  const selectedGroupElement = selectedGroupId.value
    ? groupCardElements.get(selectedGroupId.value)
    : null;

  if (selectedGroupElement?.contains(target)) {
    resetSelectionInactivityTimer();
    return;
  }

  clearSelection();
};

void initializeWorkspace();

const openGroupPopup = async () => {
  isCreatePopupOpen.value = true;
  await nextTick();
  groupNameInput.value?.focus?.();
};

const closeGroupPopup = () => {
  isCreatePopupOpen.value = false;
  groupName.value = '';
};

const submitGroupPopup = () => {
  createGroup(groupName.value);
  closeGroupPopup();
};

const openEditPopup = async (groupId, item) => {
  editTargetGroupId.value = groupId;
  editTargetItemId.value = item.id;
  editTabName.value = item.title || '';
  editTabUrl.value = item.url || '';
  isEditPopupOpen.value = true;
  await nextTick();
  editTabNameInput.value?.focus?.();
};

const closeEditPopup = () => {
  isEditPopupOpen.value = false;
  editTargetGroupId.value = '';
  editTargetItemId.value = '';
  editTabName.value = '';
  editTabUrl.value = '';
};

const submitEditPopup = () => {
  const group = groups.value.find((entry) => entry.id === editTargetGroupId.value);
  const item = group?.items.find((entry) => entry.id === editTargetItemId.value);

  if (!item) {
    closeEditPopup();
    return;
  }

  item.title = editTabName.value.trim() || 'Untitled tab';
  item.url = editTabUrl.value.trim() || 'No URL';
  closeEditPopup();
};

const openGroupEditPopup = async (group) => {
  editingGroupId.value = group.id;
  editingGroupName.value = group.name;
  isGroupEditPopupOpen.value = true;
  await nextTick();
  groupEditNameInput.value?.focus?.();
};

const closeGroupEditPopup = () => {
  isGroupEditPopupOpen.value = false;
  editingGroupId.value = '';
  editingGroupName.value = '';
};

const submitGroupEditPopup = () => {
  renameGroup(editingGroupId.value, editingGroupName.value);
  closeGroupEditPopup();
};

const closeDeleteGroupPopup = () => {
  isDeleteGroupPopupOpen.value = false;
  deleteTargetType.value = 'group';
  deleteTargetGroupId.value = '';
  deleteTargetGroupName.value = '';
  deleteTargetItemId.value = '';
  deleteTargetItemTitle.value = '';
};

const requestDeleteGroup = (group) => {
  const groupItems = Array.isArray(group.items) ? group.items : [];

  if (!groupItems.length) {
    deleteGroup(group.id);
    return;
  }

  deleteTargetType.value = 'group';
  deleteTargetGroupId.value = group.id;
  deleteTargetGroupName.value = group.name;
  isDeleteGroupPopupOpen.value = true;
};

const requestDeleteTab = (groupId, item) => {
  deleteTargetType.value = 'tab';
  deleteTargetGroupId.value = groupId;
  deleteTargetGroupName.value = '';
  deleteTargetItemId.value = item.id;
  deleteTargetItemTitle.value = item.title || 'this tab';
  isDeleteGroupPopupOpen.value = true;
};

const confirmDeleteAction = () => {
  if (deleteTargetType.value === 'tab' && deleteTargetGroupId.value && deleteTargetItemId.value) {
    deleteGroupItem(deleteTargetGroupId.value, deleteTargetItemId.value);

    if (selectedTabId.value === deleteTargetItemId.value) {
      selectedTabId.value = '';
    }

    closeDeleteGroupPopup();
    return;
  }

  if (deleteTargetGroupId.value) {
    deleteGroup(deleteTargetGroupId.value);

    if (selectedGroupId.value === deleteTargetGroupId.value) {
      clearSelection();
    }
  }

  closeDeleteGroupPopup();
};

const deleteTabFromGroup = (groupId, itemId) => {
  deleteGroupItem(groupId, itemId);

  if (selectedTabId.value === itemId) {
    selectedTabId.value = '';
  }
};

const requestDeleteSelectedItem = () => {
  const selectedTab = getSelectedTab();

  if (selectedTab && selectedGroupId.value) {
    requestDeleteTab(selectedGroupId.value, selectedTab);
    return;
  }

  const selectedGroup = getSelectedGroup();

  if (selectedGroup) {
    requestDeleteGroup(selectedGroup);
  }
};

const handleGroupItemAdd = (groupId, event) => {
  const group = groups.value.find((entry) => entry.id === groupId);

  if (!group || !Array.isArray(group.items)) {
    return;
  }

  const insertedIndex = typeof event?.newIndex === 'number' ? event.newIndex : -1;
  const insertedItem = insertedIndex >= 0 ? group.items[insertedIndex] : null;
  const insertedUrl = normalizeUrlForComparison(insertedItem?.url);

  if (!insertedItem || !insertedUrl) {
    return;
  }

  const hasDuplicateUrl = group.items.some((item, index) => {
    if (index === insertedIndex) {
      return false;
    }

    return normalizeUrlForComparison(item.url) === insertedUrl;
  });

  if (hasDuplicateUrl) {
    group.items.splice(insertedIndex, 1);
    if (selectedGroupId.value === groupId && selectedTabId.value === insertedItem.id) {
      selectedTabId.value = '';
    }
    return;
  }

  setSelectedGroup(groupId);
  selectedTabId.value = insertedItem.id;
  resetSelectionInactivityTimer();
};

const handleGroupItemDragStart = (groupId, itemIndex) => {
  beginGroupItemDrag(groupId, itemIndex);
};

const allowGroupItemDrop = (dragEvent) => {
  const draggedElement = dragEvent?.draggedContext?.element;
  const destinationList = dragEvent?.relatedContext?.list;

  if (!draggedElement || !Object.prototype.hasOwnProperty.call(draggedElement, 'tabId') || !Array.isArray(destinationList)) {
    return false;
  }

  const draggedUrl = normalizeUrlForComparison(draggedElement.url);

  if (!draggedUrl) {
    return true;
  }

  return !destinationList.some((item) => item.id !== draggedElement.id && normalizeUrlForComparison(item.url) === draggedUrl);
};

const handleKeydown = (event) => {
  if (event.key === 'Alt') {
    isAltPressed.value = true;

    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !shouldIgnoreWorkspaceShortcut(event)) {
      event.preventDefault();
    }
  }

  const shortcutIndex = Number.parseInt(event.key, 10) - 1;

  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && isDeleteGroupPopupOpen.value) {
    event.preventDefault();
    confirmDeleteAction();
    return;
  }

  if (Number.isInteger(shortcutIndex) && shortcutIndex >= 0 && shortcutIndex <= 8 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.altKey) {
      if (shouldIgnoreWorkspaceShortcut(event)) {
        return;
      }

      event.preventDefault();
      void selectGroupByShortcut(shortcutIndex);
      return;
    }

    if (!shouldIgnoreWorkspaceShortcut(event) && !isCreatePopupOpen.value && !isEditPopupOpen.value && !isGroupEditPopupOpen.value && !isDeleteGroupPopupOpen.value) {
      event.preventDefault();
      void selectTabByShortcut(shortcutIndex);
      return;
    }
  }

  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!shouldIgnoreWorkspaceShortcut(event) && !isCreatePopupOpen.value && !isEditPopupOpen.value && !isGroupEditPopupOpen.value && !isDeleteGroupPopupOpen.value) {
      event.preventDefault();
      openSelectedTab();
    }

    return;
  }

  if ((event.key === 'e' || event.key === 'E') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!shouldIgnoreWorkspaceShortcut(event) && !isCreatePopupOpen.value && !isEditPopupOpen.value && !isGroupEditPopupOpen.value && !isDeleteGroupPopupOpen.value) {
      event.preventDefault();
      editSelectedItem();
    }

    return;
  }

  if ((event.key === 'c' || event.key === 'C') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!shouldIgnoreWorkspaceShortcut(event) && !isCreatePopupOpen.value && !isEditPopupOpen.value && !isGroupEditPopupOpen.value && !isDeleteGroupPopupOpen.value) {
      event.preventDefault();
      toggleSelectedGroupCollapse();
    }

    return;
  }

  if (event.key === 'Delete' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!shouldIgnoreWorkspaceShortcut(event) && !isCreatePopupOpen.value && !isEditPopupOpen.value && !isGroupEditPopupOpen.value && !isDeleteGroupPopupOpen.value) {
      event.preventDefault();
      requestDeleteSelectedItem();
    }

    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  if (isDeleteGroupPopupOpen.value) {
    event.preventDefault();
    closeDeleteGroupPopup();
    return;
  }

  if (isGroupEditPopupOpen.value) {
    event.preventDefault();
    closeGroupEditPopup();
    return;
  }

  if (isEditPopupOpen.value) {
    event.preventDefault();
    closeEditPopup();
    return;
  }

  if (isCreatePopupOpen.value) {
    event.preventDefault();
    closeGroupPopup();
    return;
  }

  if (selectedGroupId.value || selectedTabId.value) {
    event.preventDefault();
    clearSelection();
  }
};

const handleKeyup = (event) => {
  if (event.key === 'Alt' || !event.altKey) {
    isAltPressed.value = false;
  }
};

const handleWindowBlur = () => {
  isAltPressed.value = false;
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('blur', handleWindowBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  window.removeEventListener('pointerdown', handlePointerDown, true);
  window.removeEventListener('blur', handleWindowBlur);
  clearSelectionInactivityTimer();
});
</script>

<style lang="scss" scoped src="./MainWorkspace.scss"></style>