<script setup>
// Login page (purely static demo): form validation then jump into the editor. No real backend.
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";

const router = useRouter();
const email = ref("");
const pwd = ref("");
const err = ref("");

function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { err.value = "Please enter a valid email address."; return; }
    if (!pwd.value) { err.value = "Please enter your password."; return; }
    // static demo: no backend, straight into the editor
    router.push("/app");
}
</script>

<template>
    <main class="site auth-wrap">
        <form class="auth-card" @submit.prevent="submit">
            <h1>Log in</h1>
            <p class="sub">Welcome back. Your plans are waiting.</p>
            <label>Email
                <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
            </label>
            <label>Password
                <input v-model="pwd" type="password" autocomplete="current-password" placeholder="••••••••" />
            </label>
            <p v-if="err" class="err">{{ err }}</p>
            <button type="submit" class="btn solid">Log in</button>
            <p class="alt">No account yet? <RouterLink to="/signup">Sign up — it's free</RouterLink></p>
            <p class="fine">Demo build: no server involved, logging in takes you straight to the editor.</p>
        </form>
    </main>
</template>
