<script setup>
import { computed } from "vue";
import { useRoute, RouterLink, RouterView } from "vue-router";

// Site shell: marketing pages share the top nav; the /app editor has its own toolbar and hides the nav (full-screen editing)
const route = useRoute();
const isEditor = computed(() => route.path.startsWith("/app"));
</script>

<template>
    <header v-if="!isEditor" class="site-nav">
        <RouterLink to="/" class="brand">Plan<span>Craft</span></RouterLink>
        <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/pricing">Pricing</RouterLink>
        </nav>
        <span class="spacer"></span>
        <RouterLink to="/login" class="btn ghost">Log in</RouterLink>
        <RouterLink to="/signup" class="btn solid">Get started — free</RouterLink>
    </header>
    <RouterView />
</template>
