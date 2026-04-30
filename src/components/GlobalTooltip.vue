<template>
  <Teleport to="body">
    <div class="global-tooltip-layer" aria-hidden="true">
      <Transition name="global-tooltip">
        <div
          v-if="isVisible && tooltipText"
          ref="tooltipRef"
          class="global-tooltip"
          :class="[
            `global-tooltip--${tooltipPlacement}`,
            { 'global-tooltip--ready': isTooltipReady }
          ]"
          :style="tooltipStyle"
        >
          {{ tooltipText }}
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useWorkspaceState } from '../composables/useWorkspaceState';

const { showTooltips } = useWorkspaceState();

const tooltipText = ref('');
const tooltipStyle = ref({ left: '0px', top: '0px' });
const tooltipPlacement = ref('top');
const tooltipRef = ref(null);
const isVisible = ref(false);
const isTooltipReady = ref(false);

let showTimerId = null;
let activeTarget = null;

const SHOW_DELAY_MS = 180;
const TOOLTIP_OFFSET_PX = 10;
const VIEWPORT_EDGE_PADDING_PX = 8;

const clearShowTimer = () => {
  if (showTimerId !== null) {
    window.clearTimeout(showTimerId);
    showTimerId = null;
  }
};

const hideTooltip = () => {
  clearShowTimer();
  activeTarget = null;
  isVisible.value = false;
  isTooltipReady.value = false;
  tooltipText.value = '';
};

const getTooltipTarget = (node) => {
  if (!(node instanceof Element)) {
    return null;
  }

  return node.closest('[data-tooltip]');
};

const updateTooltipPosition = () => {
  if (!activeTarget) {
    return;
  }

  const rect = activeTarget.getBoundingClientRect();
  const tooltipElement = tooltipRef.value;

  if (!tooltipElement) {
    return;
  }

  const tooltipRect = tooltipElement.getBoundingClientRect();
  const centeredLeft = rect.left + (rect.width / 2);
  const minCenter = VIEWPORT_EDGE_PADDING_PX + (tooltipRect.width / 2);
  const maxCenter = window.innerWidth - VIEWPORT_EDGE_PADDING_PX - (tooltipRect.width / 2);
  const left = Math.min(maxCenter, Math.max(minCenter, centeredLeft));

  let top = rect.top - TOOLTIP_OFFSET_PX;
  let placement = 'top';

  if ((top - tooltipRect.height) < VIEWPORT_EDGE_PADDING_PX) {
    placement = 'bottom';
    top = rect.bottom + TOOLTIP_OFFSET_PX;

    if ((top + tooltipRect.height) > (window.innerHeight - VIEWPORT_EDGE_PADDING_PX)) {
      top = Math.max(
        VIEWPORT_EDGE_PADDING_PX,
        window.innerHeight - VIEWPORT_EDGE_PADDING_PX - tooltipRect.height
      );
    }
  }

  tooltipPlacement.value = placement;
  tooltipStyle.value = {
    left: `${left}px`,
    top: `${top}px`
  };
};

const showTooltip = async (target) => {
  if (!showTooltips.value || !target) {
    return;
  }

  const text = String(target.getAttribute('data-tooltip') || '').trim();

  if (!text) {
    return;
  }

  activeTarget = target;
  tooltipText.value = text;
  isTooltipReady.value = false;
  isVisible.value = true;

  await nextTick();
  updateTooltipPosition();
  isTooltipReady.value = true;
};

const scheduleTooltip = (target) => {
  if (!showTooltips.value || !target) {
    return;
  }

  clearShowTimer();
  showTimerId = window.setTimeout(() => {
    void showTooltip(target);
  }, SHOW_DELAY_MS);
};

const handlePointerOver = (event) => {
  const target = getTooltipTarget(event.target);

  if (!target) {
    return;
  }

  if (activeTarget === target && isVisible.value) {
    updateTooltipPosition();
    return;
  }

  scheduleTooltip(target);
};

const handlePointerOut = (event) => {
  const target = getTooltipTarget(event.target);

  if (!target) {
    return;
  }

  const relatedTarget = getTooltipTarget(event.relatedTarget);

  if (relatedTarget === target) {
    return;
  }

  if (activeTarget === target) {
    hideTooltip();
    return;
  }

  clearShowTimer();
};

const handleFocusIn = (event) => {
  const target = getTooltipTarget(event.target);

  if (!target) {
    return;
  }

  if (activeTarget === target && isVisible.value) {
    updateTooltipPosition();
    return;
  }

  scheduleTooltip(target);
};

const handleFocusOut = (event) => {
  const target = getTooltipTarget(event.target);

  if (!target) {
    return;
  }

  if (activeTarget === target) {
    hideTooltip();
    return;
  }

  clearShowTimer();
};

const handleViewportChange = () => {
  if (activeTarget && isVisible.value) {
    updateTooltipPosition();
  }
};

watch(showTooltips, (enabled) => {
  if (!enabled) {
    hideTooltip();
  }
});

onMounted(() => {
  window.addEventListener('pointerover', handlePointerOver, true);
  window.addEventListener('pointerout', handlePointerOut, true);
  window.addEventListener('focusin', handleFocusIn, true);
  window.addEventListener('focusout', handleFocusOut, true);
  window.addEventListener('scroll', handleViewportChange, true);
  window.addEventListener('resize', handleViewportChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerover', handlePointerOver, true);
  window.removeEventListener('pointerout', handlePointerOut, true);
  window.removeEventListener('focusin', handleFocusIn, true);
  window.removeEventListener('focusout', handleFocusOut, true);
  window.removeEventListener('scroll', handleViewportChange, true);
  window.removeEventListener('resize', handleViewportChange);
  hideTooltip();
});
</script>

<style scoped>
.global-tooltip-layer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
}

.global-tooltip {
  position: fixed;
  left: 0;
  top: 0;
  transform: translate(-50%, -100%);
  opacity: 0;
  visibility: hidden;
  max-width: min(260px, calc(100vw - 16px));
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.92);
  color: #ffffff;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.36);
}

.global-tooltip--ready {
  opacity: 1;
  visibility: visible;
}

.global-tooltip--bottom {
  transform: translate(-50%, 0);
}

.global-tooltip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 8px;
  height: 8px;
  background: rgba(0, 0, 0, 0.92);
  transform: translateX(-50%) rotate(45deg);
}

.global-tooltip--bottom::after {
  top: -4px;
  bottom: auto;
}

.global-tooltip-enter-active,
.global-tooltip-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.global-tooltip-enter-from,
.global-tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, -100%) translateY(6px);
}

.global-tooltip-enter-to,
.global-tooltip-leave-from {
  opacity: 1;
  transform: translate(-50%, -100%) translateY(0);
}
</style>