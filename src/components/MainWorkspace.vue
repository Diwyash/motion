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
            <template #item="{ element: group }">
            <article
              class="group-card"
            >
              <header class="group-card__header">
                <button class="group-card__drag-handle" type="button" aria-label="Reorder group">
                  <span class="group-card__drag-icon" aria-hidden="true" />
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
                @start="handleGroupItemDragStart(group.id, $event.oldIndex)"
                @end="completeGroupItemDrag"
              >
                <template #item="{ element: item }">
                  <div class="group-card__item" @dblclick="openEditPopup(group.id, item)">
                    <img
                      v-if="item.favIconUrl"
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
        <form class="group-popup" @submit.prevent="confirmDeleteGroup">
          <div class="group-popup__header">
            <p class="group-popup__title">Delete</p>
            <div class="group-popup__actions">
              <button class="group-popup__button group-popup__button--cancel" type="button" aria-label="No, cancel delete" @click="closeDeleteGroupPopup" />
              <button class="group-popup__button group-popup__button--primary" type="submit" aria-label="Yes, delete group" />
            </div>
          </div>
          <p class="group-popup__message">Delete {{ deleteTargetGroupName }} and its tabs?</p>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, nextTick, ref } from 'vue';
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
const deleteTargetGroupId = ref('');
const deleteTargetGroupName = ref('');

const {
  beginGroupItemDrag,
  createGroup,
  deleteGroup,
  deleteGroupItem,
  groups,
  initializeWorkspace,
  completeGroupItemDrag,
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
  deleteTargetGroupId.value = '';
  deleteTargetGroupName.value = '';
};

const requestDeleteGroup = (group) => {
  const groupItems = Array.isArray(group.items) ? group.items : [];

  if (!groupItems.length) {
    deleteGroup(group.id);
    return;
  }

  deleteTargetGroupId.value = group.id;
  deleteTargetGroupName.value = group.name;
  isDeleteGroupPopupOpen.value = true;
};

const confirmDeleteGroup = () => {
  if (deleteTargetGroupId.value) {
    deleteGroup(deleteTargetGroupId.value);
  }

  closeDeleteGroupPopup();
};

const deleteTabFromGroup = (groupId, itemId) => {
  deleteGroupItem(groupId, itemId);
};

const handleGroupItemDragStart = (groupId, itemIndex) => {
  beginGroupItemDrag(groupId, itemIndex);
};

const allowGroupItemDrop = (dragEvent) => {
  const draggedElement = dragEvent?.draggedContext?.element;

  return Boolean(draggedElement && Object.prototype.hasOwnProperty.call(draggedElement, 'tabId'));
};

const handleKeydown = (event) => {
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
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style lang="scss" scoped src="./MainWorkspace.scss"></style>