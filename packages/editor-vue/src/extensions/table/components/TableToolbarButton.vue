<!--
  Part of the Notesnook Vue port (packages/editor-vue). Small icon button used
  by the table row/column toolbars. `title`/`disabled`/`@click` fall through to
  the native <button>; `contenteditable="false"` keeps the caret out of it.
-->
<template>
  <button type="button" class="tb-btn" contenteditable="false">
    <slot />
  </button>
</template>