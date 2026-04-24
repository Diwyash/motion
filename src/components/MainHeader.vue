<template>
  <header class="main-header" aria-label="Motion header">
    <div class="main-header__title">Motion</div>

    <div class="main-header__actions" aria-label="Header actions">
      <button class="main-header__button" type="button" aria-label="Search">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M10.5 4a6.5 6.5 0 1 0 4.01 11.62l4.44 4.44 1.06-1.06-4.44-4.44A6.5 6.5 0 0 0 10.5 4Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
          />
        </svg>
      </button>

      <button class="main-header__button" type="button" aria-label="Menu">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 6.5h16v1.5H4zm0 5h16V13H4zm0 5h16v1.5H4z" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import './MainHeader.scss';
</script>