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
                :class="{
                  'group-card--selected': selectedGroupId === group.id,
                  'group-card--collapsed': group.isCollapsed,
                  'group-card--expanded': !group.isCollapsed
                }"
                :ref="(element) => setGroupCardRef(group.id, element)"
              >
                <header class="group-card__header">
                  <button
                    class="group-card__drag-handle"
                    type="button"
                    aria-label="Reorder group"
                  >
                    <span class="group-card__drag-icon" aria-hidden="true" />
                  </button>

                  <h3 class="group-card__title">
                    {{ group.name }}
                  </h3>

                  <div class="group-card__header-actions">
                    <button
                      class="group-card__header-button group-card__header-button--edit"
                      type="button"
                      aria-label="Edit group"
                      @click="openGroupEditPopup(group)"
                    />

                    <button
                      class="group-card__collapse-button"
                      type="button"
                      aria-label="Toggle group collapse"
                      @click="toggleGroupCollapsed(group.id)"
                    />

                    <button
                      class="group-card__delete-button"
                      type="button"
                      aria-label="Delete group"
                      @click="requestDeleteGroup(group)"
                    />
                  </div>
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
                  <template #item="{ element: item }">
                    <div
                      class="group-card__item"
                      :class="{ 'group-card__item--selected': selectedGroupId === group.id && selectedTabId === item.id }"
                      :ref="(element) => setGroupItemRef(group.id, item.id, element)"
                      @click="handleGroupItemClick(group.id, item)"
                    >
                      <img
                        v-if="getSavedItemIconSrc(item, item.id)"
                        class="group-card__item-icon"
                        :src="getSavedItemIconSrc(item, item.id)"
                        :alt="`${item.title} icon`"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        @error="handleSavedItemIconError(item.id)"
                      />
                      <span v-else class="group-card__item-icon group-card__item-icon--fallback" aria-hidden="true" />

                      <span class="group-card__item-title">{{ item.title }}</span>
                      <button
                        class="group-card__edit-button"
                        type="button"
                        aria-label="Edit tab"
                        @click.stop="openEditPopup(group.id, item)"
                      />
                      <button
                        class="group-card__delete-button"
                        type="button"
                        aria-label="Delete tab"
                        @click.stop="deleteTabFromGroup(group.id, item.id)"
                      />
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
      </div>

      <button class="main-workspace__fab" type="button" @click="openGroupPopup">Create group</button>

      <div v-if="isSearchPopupOpen" class="search-popup-backdrop" @click.self="closeSearchPopup">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="search-popup__input"
          type="text"
          placeholder="Search saved tabs"
          aria-label="Search saved tabs"
          @keydown.enter.prevent="openFirstSearchResult"
          @keydown.tab.prevent="handleSearchInputTab"
          @keydown.esc.prevent="closeSearchPopup"
        />

        <div v-if="showSearchResultList" class="search-popup__results" role="list" :aria-label="searchResultsAriaLabel">
          <template v-for="(result, index) in visibleSearchResults" :key="result.key">
            <div v-if="showStoredUsageResults" class="search-popup__stored-result" role="listitem">
              <div
                :ref="(element) => setSearchResultRef(result.key, element)"
                class="search-popup__result search-popup__result--stored"
                :class="{ 'search-popup__result--selected': activeSearchResultKey === result.key || (!activeSearchResultKey && index === 0) }"
                role="button"
                tabindex="0"
                @focus="activeSearchResultKey = result.key"
                @keydown.enter.prevent="openSavedSearchResult(result)"
                @keydown.tab.prevent="handleSearchItemTab($event)"
                @click="openSavedSearchResult(result)"
              >
                <img
                  v-if="getSavedItemIconSrc(result.item, result.key)"
                  class="search-popup__result-icon"
                  :src="getSavedItemIconSrc(result.item, result.key)"
                  :alt="`${result.title} icon`"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="handleSavedItemIconError(result.key)"
                />
                <span v-else class="search-popup__result-icon search-popup__result-icon--fallback" aria-hidden="true" />

                <span class="search-popup__result-content">
                  <span class="search-popup__result-header">
                    <span class="search-popup__result-title">{{ result.title }}</span>
                  </span>
                  <span class="search-popup__result-url">{{ result.item.url || 'No URL' }}</span>
                </span>

                <span class="search-popup__result-right">
                  <span class="search-popup__result-group">{{ result.groupName }}</span>
                </span>
              </div>
            </div>

            <button
              v-else
              :ref="(element) => setSearchResultRef(result.key, element)"
              class="search-popup__result"
              :class="{ 'search-popup__result--selected': activeSearchResultKey === result.key || (!activeSearchResultKey && index === 0) }"
              type="button"
              role="listitem"
              @focus="activeSearchResultKey = result.key"
              @keydown.enter.prevent="openSavedSearchResult(result)"
              @keydown.tab.prevent="handleSearchItemTab($event)"
              @click="openSavedSearchResult(result)"
            >
              <img
                v-if="getSavedItemIconSrc(result.item, result.key)"
                class="search-popup__result-icon"
                :src="getSavedItemIconSrc(result.item, result.key)"
                :alt="`${result.title} icon`"
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="handleSavedItemIconError(result.key)"
              />
              <span v-else class="search-popup__result-icon search-popup__result-icon--fallback" aria-hidden="true" />

              <span class="search-popup__result-content">
                <span class="search-popup__result-header">
                  <span class="search-popup__result-title">{{ result.title }}</span>
                </span>
                <span class="search-popup__result-url">{{ result.item.url || 'No URL' }}</span>
              </span>

              <span class="search-popup__result-right">
                <span class="search-popup__result-group">{{ result.groupName }}</span>
              </span>
            </button>
          </template>

            <button
              v-if="normalizedSearchQuery && !visibleSearchResults.length"
              ref="searchGoogleResultRef"
              class="search-popup__result search-popup__result--google"
              type="button"
              role="listitem"
              @focus="activeSearchResultKey = 'google'"
              @keydown.enter.prevent="openGoogleSearchFromQuery"
              @keydown.tab.prevent="handleSearchItemTab($event)"
              @click="openGoogleSearchFromQuery"
            >
              <span class="search-popup__result-icon search-popup__result-icon--google" aria-hidden="true">G</span>

              <span class="search-popup__result-content">
                <span class="search-popup__result-header">
                  <span class="search-popup__result-title">Search Google for "{{ searchQuery.trim() }}"</span>
                </span>
                <span class="search-popup__result-url">Open a new Google search</span>
              </span>

              <span class="search-popup__result-right">
                <span class="search-popup__result-group">Google</span>
              </span>
            </button>

            <button
              v-if="showSearchSettingsAction"
              ref="searchSettingsResultRef"
              class="search-popup__result search-popup__result--action"
              type="button"
              role="listitem"
              @focus="activeSearchResultKey = 'settings'"
              @keydown.enter.prevent="openSettingsPopup"
              @keydown.tab.prevent="handleSearchItemTab($event)"
              @click="openSettingsPopup"
            >
              <span class="search-popup__result-icon search-popup__result-icon--action" aria-hidden="true">S</span>

              <span class="search-popup__result-content">
                <span class="search-popup__result-header">
                  <span class="search-popup__result-title">Open Settings</span>
                </span>
                <span class="search-popup__result-url">Adjust Motion preferences</span>
              </span>

              <span class="search-popup__result-right">
                <span class="search-popup__result-group">Action</span>
              </span>
            </button>

            <button
              v-if="showSearchThemeAction"
              ref="searchThemeResultRef"
              class="search-popup__result search-popup__result--action"
              type="button"
              role="listitem"
              @focus="activeSearchResultKey = 'theme'"
              @keydown.enter.prevent="switchThemeFromSearch"
              @keydown.tab.prevent="handleSearchItemTab($event)"
              @click="switchThemeFromSearch"
            >
              <span class="search-popup__result-icon search-popup__result-icon--action" aria-hidden="true">T</span>

              <span class="search-popup__result-content">
                <span class="search-popup__result-header">
                  <span class="search-popup__result-title">Switch Theme</span>
                </span>
                <span class="search-popup__result-url">Toggle between light and dark</span>
              </span>

              <span class="search-popup__result-right">
                <span class="search-popup__result-group">Action</span>
              </span>
            </button>

            <button
              v-if="showSearchCreateGroupAction"
              ref="searchCreateGroupResultRef"
              class="search-popup__result search-popup__result--action"
              type="button"
              role="listitem"
              @focus="activeSearchResultKey = 'create-group'"
              @keydown.enter.prevent="openGroupPopup"
              @keydown.tab.prevent="handleSearchItemTab($event)"
              @click="openGroupPopup"
            >
              <span class="search-popup__result-icon search-popup__result-icon--action" aria-hidden="true">+</span>

              <span class="search-popup__result-content">
                <span class="search-popup__result-header">
                  <span class="search-popup__result-title">Create New Group</span>
                </span>
                <span class="search-popup__result-url">Start a new tab group</span>
              </span>

              <span class="search-popup__result-right">
                <span class="search-popup__result-group">Action</span>
              </span>
            </button>
        </div>
      </div>

      <div v-if="isSettingsPopupOpen" class="settings-popup-backdrop" @click.self="closeSettingsPopup">
        <section class="settings-popup" aria-label="Settings">
          <div class="settings-popup__header">
            <div>
              <p class="settings-popup__title">Settings</p>
            </div>
            <button
              class="settings-popup__close"
              type="button"
              :data-tooltip="showTooltips ? 'Close settings' : ''"
              aria-label="Close settings"
              @click="closeSettingsPopup"
            />
          </div>

          <div class="settings-popup__body">
            <div class="settings-popup__toggle-row">
              <label class="settings-popup__checkbox" aria-label="Open tabs in new page">
                <input
                  class="settings-popup__checkbox-input"
                  type="checkbox"
                  :checked="openTabsInNewPage"
                  @change="toggleOpenTabsInNewPage"
                />
                <span class="settings-popup__checkbox-box" aria-hidden="true" />
              </label>

              <p class="settings-popup__toggle-title">Open tabs in new page</p>
            </div>

            <div class="settings-popup__toggle-row">
              <label class="settings-popup__checkbox" aria-label="Hide tab list indicator">
                <input
                  class="settings-popup__checkbox-input"
                  type="checkbox"
                  :checked="hideTabListIndicator"
                  @change="toggleHideTabListIndicator"
                />
                <span class="settings-popup__checkbox-box" aria-hidden="true" />
              </label>

              <p class="settings-popup__toggle-title">Hide tab list indicator</p>
            </div>

            <div class="settings-popup__toggle-row settings-popup__toggle-row--with-action">
              <label class="settings-popup__checkbox" aria-label="Show recent tabs on search open">
                <input
                  class="settings-popup__checkbox-input"
                  type="checkbox"
                  :checked="showRecentTabsOnSearchOpen"
                  @change="toggleShowRecentTabsOnSearchOpen"
                />
                <span class="settings-popup__checkbox-box" aria-hidden="true" />
              </label>

              <p class="settings-popup__toggle-title">Show most used tabs on search open</p>

              <button
                class="settings-popup__toggle-action"
                type="button"
                @click="clearMostUsedTabsHistory"
              >
                Clear history
              </button>
            </div>

            <div class="settings-popup__toggle-row">
              <label class="settings-popup__checkbox" aria-label="Show tooltips">
                <input
                  class="settings-popup__checkbox-input"
                  type="checkbox"
                  :checked="showTooltips"
                  @change="toggleShowTooltips"
                />
                <span class="settings-popup__checkbox-box" aria-hidden="true" />
              </label>

              <p class="settings-popup__toggle-title">Show tooltips</p>
            </div>

            <div class="settings-popup__field">
              <label class="settings-popup__field-label" for="motion-theme-select">Theme</label>
              <div class="settings-popup__dropdown" ref="themeDropdownRef">
                <button
                  id="motion-theme-select"
                  class="settings-popup__select"
                  type="button"
                  :aria-expanded="isThemeDropdownOpen"
                  aria-haspopup="listbox"
                  @click="toggleThemeDropdown"
                >
                  <span class="settings-popup__select-value">{{ currentThemeLabel }}</span>
                  <svg class="settings-popup__select-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                  </svg>
                </button>

                <div v-if="isThemeDropdownOpen" class="settings-popup__select-menu" role="listbox" aria-label="Theme options">
                  <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    class="settings-popup__select-option"
                    :class="{ 'settings-popup__select-option--selected': theme === option.value }"
                    type="button"
                    role="option"
                    :aria-selected="theme === option.value"
                    @click="selectTheme(option.value)"
                  >
                    <span class="settings-popup__select-option-label">{{ option.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="settings-popup__storage-line" aria-label="Chrome sync storage usage">
              <span class="settings-popup__storage-label">Sync storage used</span>
              <span class="settings-popup__storage-value">
                <template v-if="isSyncStorageUsageLoading">Loading...</template>
                <template v-else-if="syncStorageUsage">{{ formatStorageBytes(syncStorageUsage.usedBytes) }} of {{ formatStorageBytes(syncStorageUsage.quotaBytes) }}</template>
                <template v-else>Unavailable</template>
              </span>
            </div>
          </div>
        </section>
      </div>

      <div v-if="isInstructionsPopupOpen" class="instructions-popup-backdrop" @click.self="closeInstructionsPopup">
        <section class="instructions-popup" aria-label="Instructions">
          <div class="instructions-popup__header">
            <div>
              <p class="instructions-popup__title">Instructions</p>
              <p class="instructions-popup__subtitle">How Motion works</p>
            </div>
            <button class="instructions-popup__close" type="button" :data-tooltip="showTooltips ? 'Close instructions' : ''" aria-label="Close instructions" @click="closeInstructionsPopup" />
          </div>

          <div class="instructions-popup__body">
            <section class="instructions-popup__section">
              <h4 class="instructions-popup__heading">Search saved tabs</h4>
              <p class="instructions-popup__text">Use the search icon or press <strong>i</strong> to open search. Motion can show your most used tabs immediately, and typing a tab name fuzzy matches saved tabs. Press <strong>Enter</strong> to open the first match, or <strong>Tab</strong> to move through the visible results and action rows.</p>
              <p class="instructions-popup__text">When there are no saved matches, Motion shows a Google search option instead. The result list also includes <strong>Open Settings</strong> and <strong>Create New Group</strong> when your query matches those actions.</p>
            </section>

            <section class="instructions-popup__section">
              <h4 class="instructions-popup__heading">Work with groups and tabs</h4>
              <p class="instructions-popup__text">Create groups from the floating button, then drag tabs into them. Reorder groups with the handle in each group header and reorder tabs by dragging them between groups.</p>
              <p class="instructions-popup__text">Use the edit buttons on groups and tabs to rename them. Delete buttons remove groups or tabs after confirmation. Group cards can also be collapsed or expanded from the header controls.</p>
            </section>

            <section class="instructions-popup__section">
              <h4 class="instructions-popup__heading">Keyboard shortcuts</h4>
              <p class="instructions-popup__text">Press <strong>Enter</strong> to open the selected tab, <strong>e</strong> to edit the selected item, <strong>c</strong> to collapse or expand the selected group, and <strong>Delete</strong> to remove the selected group or tab.</p>
              <p class="instructions-popup__text">Use <strong>1</strong> through <strong>9</strong> to select tabs within the selected group. Use <strong>Alt</strong> + <strong>1</strong> through <strong>9</strong> to select groups.</p>
            </section>

            <section class="instructions-popup__section">
              <h4 class="instructions-popup__heading">Settings</h4>
              <p class="instructions-popup__text">The Settings modal controls whether saved tabs and Google searches open in a new page or reuse the current tab, and it lets you switch between light and dark themes. It also shows your Chrome sync storage usage.</p>
            </section>

            <section class="instructions-popup__section">
              <h4 class="instructions-popup__heading">Search behavior</h4>
              <p class="instructions-popup__text">Search only looks at tab names. Matching is fuzzy, duplicate saved results are removed, and the current focus stays on one item at a time as you move through the list. Most used tabs can be shown when search opens from Settings.</p>
            </section>
          </div>
        </section>
      </div>

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
            maxlength="30"
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
            maxlength="30"
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
            maxlength="30"
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

      <div class="main-workspace__toast-layer" aria-live="polite" aria-atomic="true">
        <Transition name="main-workspace__toast">
          <div v-if="isToastVisible" class="main-workspace__toast" :class="{ 'main-workspace__toast--collapsing': isToastCollapsing }">
            {{ toastMessage }}
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue';
import Draggable from 'vuedraggable';
import { useWorkspaceState } from '../composables/useWorkspaceState';

const groupName = ref('');
const isCreatePopupOpen = ref(false);
const groupNameInput = ref(null);
const isSearchPopupOpen = ref(false);
const searchInputRef = ref(null);
const searchQuery = ref('');
const activeSearchResultKey = ref('');
const isSettingsPopupOpen = ref(false);
const isThemeDropdownOpen = ref(false);
const themeDropdownRef = ref(null);
const isInstructionsPopupOpen = ref(false);
const toastMessage = ref('');
const isToastVisible = ref(false);
const isToastCollapsing = ref(false);
const syncStorageUsage = ref(null);
const isSyncStorageUsageLoading = ref(false);
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

const groupCardElements = new Map();
const groupItemElements = new Map();
const searchResultElements = new Map();
const searchGoogleResultRef = ref(null);
const searchSettingsResultRef = ref(null);
const searchThemeResultRef = ref(null);
const searchCreateGroupResultRef = ref(null);
const OVERLAY_STATE_EVENT = 'motion:overlay-state';
let toastVisibleTimerId = null;
let toastCollapseTimerId = null;

const {
  beginGroupItemDrag,
  createGroup,
  currentTabs,
  deleteGroup,
  deleteGroupItem,
  groups,
  initializeWorkspace,
  completeGroupItemDrag,
  closePanel,
  clearMostUsedTabs,
  hideTabListIndicator,
  mostUsedTabs,
  openSavedTab,
  openTabsInNewPage,
  renameGroup,
  setTheme,
  theme,
  themeOptions,
  toggleTheme,
  toggleHideTabListIndicator,
  showRecentTabsOnSearchOpen,
  toggleShowRecentTabsOnSearchOpen,
  showTooltips,
  toggleShowTooltips,
  toggleOpenTabsInNewPage,
  toggleGroupCollapsed,
  resolveSavedItemFavIconUrl,
  tabTitle,
  tabUrl
} = useWorkspaceState();

const brokenSavedItemIcons = ref(new Set());

const getSavedItemIconSrc = (item, itemKey) => {
  if (itemKey && brokenSavedItemIcons.value.has(String(itemKey))) {
    return '';
  }

  return resolveSavedItemFavIconUrl(item);
};

const handleSavedItemIconError = (itemKey) => {
  if (!itemKey) {
    return;
  }

  const nextBrokenIcons = new Set(brokenSavedItemIcons.value);
  nextBrokenIcons.add(String(itemKey));
  brokenSavedItemIcons.value = nextBrokenIcons;
};

const groupBoardDragOptions = {
  name: 'motion-groups',
  pull: true,
  put: false
};

const SEARCH_OPEN_EVENT = 'motion:open-search';
const INSTRUCTIONS_OPEN_EVENT = 'motion:open-instructions';
const SETTINGS_OPEN_EVENT = 'motion:open-settings';
const CLOSE_OVERLAYS_EVENT = 'motion:close-overlays';

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

const setSearchResultRef = (resultKey, element) => {
  if (element) {
    searchResultElements.set(resultKey, element);
    return;
  }

  searchResultElements.delete(resultKey);
};

const closeAllOverlays = () => {
  closeSearchPopup();
  closeInstructionsPopup();
  closeSettingsPopup();
  closeGroupPopup();
  closeEditPopup();
  closeGroupEditPopup();
  closeDeleteGroupPopup();
  void closePanel();
};

const hasOpenPopup = () => isCreatePopupOpen.value || isEditPopupOpen.value || isGroupEditPopupOpen.value || isDeleteGroupPopupOpen.value || isSearchPopupOpen.value || isSettingsPopupOpen.value || isInstructionsPopupOpen.value;

watch(
  () => hasOpenPopup(),
  (isOpen) => {
    window.dispatchEvent(new CustomEvent(OVERLAY_STATE_EVENT, {
      detail: { isOpen }
    }));
  },
  { immediate: true }
);

const canHandleWorkspaceShortcut = (event, requireSelectedGroup = false) => {
  if (shouldIgnoreWorkspaceShortcut(event) || hasOpenPopup()) {
    return false;
  }

  return !requireSelectedGroup || Boolean(selectedGroupId.value);
};

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

const normalizeName = (value) => String(value || '').trim().slice(0, 30);

const normalizeSearchText = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const normalizedSearchQuery = computed(() => normalizeSearchText(searchQuery.value).replace(/\s+/g, ''));

const getFuzzyMatchScore = (text, normalizedQuery) => {
  const normalizedText = normalizeSearchText(text).replace(/\s+/g, '');
  const compactQuery = normalizedQuery.replace(/\s+/g, '');

  if (!normalizedText || !compactQuery) {
    return null;
  }

  let textIndex = 0;
  let gaps = 0;

  for (const character of compactQuery) {
    const matchIndex = normalizedText.indexOf(character, textIndex);

    if (matchIndex === -1) {
      return null;
    }

    gaps += matchIndex - textIndex;
    textIndex = matchIndex + 1;
  }

  const prefixBonus = normalizedText.startsWith(compactQuery) ? compactQuery.length * 2 : 0;

  return (compactQuery.length * 20) + prefixBonus - gaps;
};

const savedTabSearchResults = computed(() => {
  const normalizedQuery = normalizedSearchQuery.value;

  if (!normalizedQuery) {
    return [];
  }

  const resultsByTitle = new Map();

  for (const group of groups.value) {
      const groupItems = Array.isArray(group.items) ? group.items : [];

      for (const item of groupItems) {
        const title = item.title || 'Untitled tab';
        const score = getFuzzyMatchScore(title, normalizedQuery);

        if (score === null) {
          continue;
        }

        const normalizedTitle = normalizeSearchText(title);
        const existingResult = resultsByTitle.get(normalizedTitle);

        if (!existingResult || score > existingResult.score) {
          resultsByTitle.set(normalizedTitle, {
            key: `${group.id}:${item.id}`,
            title,
            groupName: group.name || 'Untitled group',
            item,
            score
          });
        }
      }
  }

  return Array.from(resultsByTitle.values())
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 8);
});

const currentOpenTabUrls = computed(() => new Set(
  currentTabs.value
    .map((tab) => normalizeUrlForComparison(tabUrl(tab)))
    .filter(Boolean)
));

const mostUsedTabSearchResults = computed(() => {
  if (normalizedSearchQuery.value || !showRecentTabsOnSearchOpen.value) {
    return [];
  }

  return mostUsedTabs.value
    .filter((entry) => entry.url && !currentOpenTabUrls.value.has(entry.url))
    .slice(0, 8)
    .map((entry) => ({
      key: entry.key,
      title: entry.title,
      groupName: 'Most used',
      item: {
        tabId: null,
        windowId: null,
        title: entry.title,
        url: entry.url,
        favIconUrl: entry.favIconUrl || ''
      },
      useCount: entry.useCount,
      removable: true
    }));
});

const visibleSearchResults = computed(() => {
  if (normalizedSearchQuery.value) {
    return savedTabSearchResults.value;
  }

  return mostUsedTabSearchResults.value;
});

const showStoredUsageResults = computed(() => !normalizedSearchQuery.value && showRecentTabsOnSearchOpen.value);

const showSearchResultList = computed(() => Boolean(normalizedSearchQuery.value) || Boolean(showStoredUsageResults.value && visibleSearchResults.value.length));

const searchResultsAriaLabel = computed(() => {
  if (normalizedSearchQuery.value) {
    return 'Matching saved tabs';
  }

  return 'Most used tabs';
});

const showSearchSettingsAction = computed(() => {
  const normalizedQuery = normalizedSearchQuery.value;

  return Boolean(normalizedQuery) && getFuzzyMatchScore('Open Settings', normalizedQuery) !== null;
});

const showSearchThemeAction = computed(() => {
  const normalizedQuery = normalizedSearchQuery.value;

  return Boolean(normalizedQuery) && getFuzzyMatchScore('Switch Theme', normalizedQuery) !== null;
});

const showSearchCreateGroupAction = computed(() => {
  const normalizedQuery = normalizedSearchQuery.value;

  return Boolean(normalizedQuery) && getFuzzyMatchScore('Create New Group', normalizedQuery) !== null;
});

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
  await nextTick();
  groupCardElements.get(group.id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
};

const selectAdjacentGroup = async (offset) => {
  if (!selectedGroupId.value) {
    return;
  }

  const currentIndex = groups.value.findIndex((group) => group.id === selectedGroupId.value);

  if (currentIndex === -1) {
    return;
  }

  const nextIndex = currentIndex + offset;

  if (nextIndex < 0 || nextIndex >= groups.value.length) {
    return;
  }

  const nextGroup = groups.value[nextIndex];

  if (!nextGroup) {
    return;
  }

  setSelectedGroup(nextGroup.id);
  selectedTabId.value = '';
  await nextTick();
  groupCardElements.get(nextGroup.id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
  await openSavedTab(selectedItem);
  await scrollSelectedTabIntoView(selectedGroup.id, selectedItem.id);
};

const selectTabInSelectedGroup = async (offset) => {
  const selectedGroup = getSelectedGroup();

  if (!selectedGroup) {
    return;
  }

  ensureSelectedGroupVisible(selectedGroup);

  const groupItems = Array.isArray(selectedGroup.items) ? selectedGroup.items : [];

  if (!groupItems.length) {
    return;
  }

  const currentIndex = selectedTabId.value
    ? groupItems.findIndex((item) => item.id === selectedTabId.value)
    : -1;

  const nextIndex = currentIndex === -1
    ? (offset > 0 ? 0 : groupItems.length - 1)
    : Math.min(groupItems.length - 1, Math.max(0, currentIndex + offset));

  const selectedItem = groupItems[nextIndex];

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
    resetSelectionInactivityTimer();
    return;
  }

  const selectedGroup = getSelectedGroup();

  if (!selectedGroup) {
    return;
  }

  const groupItems = Array.isArray(selectedGroup.items) ? selectedGroup.items : [];

  if (!groupItems.length) {
    return;
  }

  const firstItem = groupItems[0];

  if (!firstItem) {
    return;
  }

  selectedTabId.value = firstItem.id;
  resetSelectionInactivityTimer();
  await openSavedTab(firstItem);
  await scrollSelectedTabIntoView(selectedGroup.id, firstItem.id);
};

const openSearchPopup = async () => {
  closeAllOverlays();
  searchQuery.value = '';
  activeSearchResultKey.value = '';
  isSearchPopupOpen.value = true;
  await nextTick();
  searchInputRef.value?.focus?.();
};

const closeSearchPopup = () => {
  isSearchPopupOpen.value = false;
  searchQuery.value = '';
  activeSearchResultKey.value = '';
};

const openSettingsPopup = () => {
  closeAllOverlays();
  isSettingsPopupOpen.value = true;
  void refreshSyncStorageUsage();
};

const openInstructionsPopup = () => {
  closeAllOverlays();
  isInstructionsPopupOpen.value = true;
};

const closeSettingsPopup = () => {
  closeThemeDropdown();
  isSettingsPopupOpen.value = false;
};

const clearToastTimers = () => {
  if (toastVisibleTimerId !== null) {
    window.clearTimeout(toastVisibleTimerId);
    toastVisibleTimerId = null;
  }

  if (toastCollapseTimerId !== null) {
    window.clearTimeout(toastCollapseTimerId);
    toastCollapseTimerId = null;
  }
};

const showToast = (message) => {
  clearToastTimers();
  toastMessage.value = message;
  isToastVisible.value = true;
  isToastCollapsing.value = false;

  toastVisibleTimerId = window.setTimeout(() => {
    isToastCollapsing.value = true;

    toastCollapseTimerId = window.setTimeout(() => {
      isToastVisible.value = false;
      isToastCollapsing.value = false;
      toastMessage.value = '';
    }, 260);
    }, 1500);
};

const closeInstructionsPopup = () => {
  isInstructionsPopupOpen.value = false;
};

const currentThemeLabel = computed(() => themeOptions.find((option) => option.value === theme.value)?.label || 'System');

const openThemeDropdown = () => {
  isThemeDropdownOpen.value = true;
};

const closeThemeDropdown = () => {
  isThemeDropdownOpen.value = false;
};

const toggleThemeDropdown = () => {
  if (isThemeDropdownOpen.value) {
    closeThemeDropdown();
    return;
  }

  openThemeDropdown();
};

const selectTheme = (nextTheme) => {
  setTheme(nextTheme);
  closeThemeDropdown();
};

const handleThemeDropdownPointerDown = (event) => {
  if (!isThemeDropdownOpen.value) {
    return;
  }

  if (themeDropdownRef.value?.contains(event.target)) {
    return;
  }

  closeThemeDropdown();
};

const formatStorageBytes = (bytes) => {
  if (!Number.isFinite(bytes)) {
    return 'Unknown';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const refreshSyncStorageUsage = async () => {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync?.getBytesInUse) {
    syncStorageUsage.value = null;
    return;
  }

  isSyncStorageUsageLoading.value = true;

  try {
    const bytesInUse = await new Promise((resolve) => {
      chrome.storage.sync.getBytesInUse(null, (value) => resolve(value));
    });

    const quotaBytes = typeof chrome.storage.sync.QUOTA_BYTES === 'number'
      ? chrome.storage.sync.QUOTA_BYTES
      : 102400;

    const usedBytes = Number(bytesInUse) || 0;

    syncStorageUsage.value = {
      usedBytes,
      quotaBytes
    };
  } catch {
    syncStorageUsage.value = null;
  } finally {
    isSyncStorageUsageLoading.value = false;
  }
};

const openSavedSearchResult = async (result) => {
  if (!result?.item) {
    return;
  }

  activeSearchResultKey.value = result.key;
  await openSavedTab(result.item);
  closeSearchPopup();
};

const openGoogleSearch = async (query) => {
  const trimmedQuery = String(query || '').trim();

  if (!trimmedQuery) {
    return;
  }

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`;

  if (!openTabsInNewPage.value) {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = activeTabs[0];

    if (activeTab?.id) {
      await chrome.tabs.update(activeTab.id, { url: searchUrl, active: true });

      if (typeof chrome.windows?.update === 'function' && typeof activeTab.windowId === 'number') {
        await chrome.windows.update(activeTab.windowId, { focused: true });
      }

      closeSearchPopup();
      return;
    }
  }

  if (typeof chrome !== 'undefined' && typeof chrome.tabs?.create === 'function') {
    await chrome.tabs.create({ url: searchUrl, active: false });
  } else {
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  }

  closeSearchPopup();
};

const openGoogleSearchFromQuery = async () => {
  await openGoogleSearch(searchQuery.value);
};

const openFirstSearchResult = async () => {
  const firstResult = visibleSearchResults.value[0];

  if (!firstResult) {
    if (!normalizedSearchQuery.value) {
      return;
    }

    await openGoogleSearchFromQuery();
    return;
  }

  await openSavedSearchResult(firstResult);
};

const clearMostUsedTabsHistory = async () => {
  closeSettingsPopup();
  await clearMostUsedTabs();
  activeSearchResultKey.value = '';
  showToast('History cleared');
};

const focusSearchInput = async () => {
  await nextTick();
  searchInputRef.value?.focus?.();
};

const handleSearchInputTab = async () => {
  const targets = getVisibleSearchTargets();
  const nextTarget = targets.length > 1 ? targets[1] : targets[0];

  if (nextTarget?.element) {
    await nextTick();
    nextTarget.element.focus?.();
    return;
  }

  await focusSearchInput();
};

const getVisibleSearchTargets = () => {
  const targets = visibleSearchResults.value
    .map((result) => ({
      element: searchResultElements.get(result.key)
    }))
    .filter((target) => target.element);

  if (normalizedSearchQuery.value && !visibleSearchResults.value.length && searchGoogleResultRef.value) {
    targets.push({ element: searchGoogleResultRef.value });
  }

  if (showSearchSettingsAction.value && searchSettingsResultRef.value) {
    targets.push({ element: searchSettingsResultRef.value });
  }

  if (showSearchThemeAction.value && searchThemeResultRef.value) {
    targets.push({ element: searchThemeResultRef.value });
  }

  if (showSearchCreateGroupAction.value && searchCreateGroupResultRef.value) {
    targets.push({ element: searchCreateGroupResultRef.value });
  }

  return targets;
};

const handleSearchItemTab = async (event) => {
  const targets = getVisibleSearchTargets();
  const currentIndex = targets.findIndex((target) => target.element === event.currentTarget);

  if (currentIndex === -1) {
    return;
  }

  event.preventDefault();
  activeSearchResultKey.value = '';

  const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;

  if (nextIndex >= 0 && nextIndex < targets.length) {
    await nextTick();
    targets[nextIndex].element?.focus?.();
    return;
  }

  await focusSearchInput();
};

const switchThemeFromSearch = () => {
  toggleTheme();
  closeSearchPopup();
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
  closeAllOverlays();
  isCreatePopupOpen.value = true;
  await nextTick();
  groupNameInput.value?.focus?.();
};

const closeGroupPopup = () => {
  isCreatePopupOpen.value = false;
  groupName.value = '';
};

const submitGroupPopup = () => {
  createGroup(normalizeName(groupName.value));
  closeGroupPopup();
};

const openEditPopup = async (groupId, item) => {
  closeAllOverlays();
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

  item.title = normalizeName(editTabName.value) || 'Untitled tab';
  item.url = editTabUrl.value.trim() || 'No URL';
  closeEditPopup();
};

const openGroupEditPopup = async (group) => {
  closeAllOverlays();
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
  renameGroup(editingGroupId.value, normalizeName(editingGroupName.value));
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
    closeAllOverlays();
    deleteGroup(group.id);
    return;
  }

  closeAllOverlays();
  deleteTargetType.value = 'group';
  deleteTargetGroupId.value = group.id;
  deleteTargetGroupName.value = group.name;
  isDeleteGroupPopupOpen.value = true;
};

const requestDeleteTab = (groupId, item) => {
  closeAllOverlays();
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
  if ((event.key === 'i' || event.key === 'I') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (shouldIgnoreWorkspaceShortcut(event)) {
      return;
    }

    event.preventDefault();

    if (isSearchPopupOpen.value) {
      closeSearchPopup();
      return;
    }

    if (hasOpenPopup()) {
      return;
    }

    void openSearchPopup();
    return;
  }

  const shortcutIndex = Number.parseInt(event.key, 10) - 1;

  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && isDeleteGroupPopupOpen.value) {
    event.preventDefault();
    confirmDeleteAction();
    return;
  }

  if (Number.isInteger(shortcutIndex) && shortcutIndex >= 0 && shortcutIndex <= 8 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.altKey) {
      if (canHandleWorkspaceShortcut(event)) {
        event.preventDefault();
        void selectGroupByShortcut(shortcutIndex);
      }

      return;
    }

    if (canHandleWorkspaceShortcut(event, true)) {
      event.preventDefault();
      void selectTabByShortcut(shortcutIndex);
      return;
    }
  }

  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (canHandleWorkspaceShortcut(event, true)) {
      event.preventDefault();
      void selectAdjacentGroup(event.key === 'ArrowRight' ? 1 : -1);
    }

    return;
  }

  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (canHandleWorkspaceShortcut(event, true)) {
      event.preventDefault();
      void selectTabInSelectedGroup(event.key === 'ArrowDown' ? 1 : -1);
    }

    return;
  }

  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (canHandleWorkspaceShortcut(event)) {
      event.preventDefault();
      openSelectedTab();
    }

    return;
  }

  if ((event.key === 'e' || event.key === 'E') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (canHandleWorkspaceShortcut(event)) {
      event.preventDefault();
      editSelectedItem();
    }

    return;
  }

  if ((event.key === 'c' || event.key === 'C') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (canHandleWorkspaceShortcut(event)) {
      event.preventDefault();
      toggleSelectedGroupCollapse();
    }

    return;
  }

  if (event.key === 'Delete' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (canHandleWorkspaceShortcut(event)) {
      event.preventDefault();
      requestDeleteSelectedItem();
    }

    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  if (isThemeDropdownOpen.value) {
    event.preventDefault();
    closeThemeDropdown();
    return;
  }

  if (isSettingsPopupOpen.value) {
    event.preventDefault();
    closeSettingsPopup();
    return;
  }

  if (isInstructionsPopupOpen.value) {
    event.preventDefault();
    closeInstructionsPopup();
    return;
  }

  if (isDeleteGroupPopupOpen.value) {
    event.preventDefault();
    closeDeleteGroupPopup();
    return;
  }

  if (isSearchPopupOpen.value) {
    event.preventDefault();
    closeSearchPopup();
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

const handleWindowBlur = () => {
  closeSearchPopup();
  closeInstructionsPopup();
  closeSettingsPopup();
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('pointerdown', handleThemeDropdownPointerDown, true);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener(SEARCH_OPEN_EVENT, openSearchPopup);
  window.addEventListener(INSTRUCTIONS_OPEN_EVENT, openInstructionsPopup);
  window.addEventListener(SETTINGS_OPEN_EVENT, openSettingsPopup);
  window.addEventListener(CLOSE_OVERLAYS_EVENT, closeAllOverlays);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pointerdown', handlePointerDown, true);
  window.removeEventListener('pointerdown', handleThemeDropdownPointerDown, true);
  window.removeEventListener('blur', handleWindowBlur);
  window.removeEventListener(SEARCH_OPEN_EVENT, openSearchPopup);
  window.removeEventListener(INSTRUCTIONS_OPEN_EVENT, openInstructionsPopup);
  window.removeEventListener(SETTINGS_OPEN_EVENT, openSettingsPopup);
  window.removeEventListener(CLOSE_OVERLAYS_EVENT, closeAllOverlays);
  clearToastTimers();
  clearSelectionInactivityTimer();
});
</script>

<style lang="scss" scoped src="./MainWorkspace.scss"></style>