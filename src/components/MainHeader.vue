<template>
  <header class="main-header" aria-label="Motion header">
    <div class="main-header__title">Motion</div>

    <div class="main-header__actions" aria-label="Header actions">
      <button class="main-header__button" type="button" aria-label="Search" @click="openSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M10.5 4a6.5 6.5 0 1 0 4.01 11.62l4.44 4.44 1.06-1.06-4.44-4.44A6.5 6.5 0 0 0 10.5 4Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
          />
        </svg>
      </button>

      <button class="main-header__button" type="button" aria-label="Instructions" @click="openInstructions">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 4.25a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 6.25Zm1.5 11.5h-3v-1.5h.75v-3.75H10.5V11h3v5.5h.75Z" />
        </svg>
      </button>

      <button class="main-header__button" type="button" aria-label="Settings" @click="openSettings">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 7.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
          />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import './MainHeader.scss';

const SEARCH_OPEN_EVENT = 'motion:open-search';
const INSTRUCTIONS_OPEN_EVENT = 'motion:open-instructions';
const SETTINGS_OPEN_EVENT = 'motion:open-settings';

const openSearch = () => {
  window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT));
};

const openInstructions = () => {
  window.dispatchEvent(new CustomEvent(INSTRUCTIONS_OPEN_EVENT));
};

const openSettings = () => {
  window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT));
};
</script>