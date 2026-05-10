<script setup>
import { useGlobalState } from '../store'
const { openSettings } = useGlobalState()
</script>

<template>
    <div>
        <n-divider class="footer-divider" />
    </div>
</template>


<style scoped>
.footer-divider {
    margin: 0;
    padding: 0 var(--x-padding);
}
</style>
