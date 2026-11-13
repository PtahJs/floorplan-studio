<script setup>
// Signup page (purely static demo): form validation then jump into the editor. No real backend.
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";

const router = useRouter();
const name = ref("");
const email = ref("");
const pwd = ref("");
const err = ref("");

function submit() {
    if (!name.value.trim()) { err.value = "Please enter your name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { err.value = "Please enter a valid email address."; return; }
    if (pwd.value.length < 8) { err.value = "Password must be at least 8 characters."; return; }
    // static demo: no backend, straight into the editor
    router.push("/app");
}
</script>

<template>
    <main class="site auth-wrap">
        <form class="auth-card" @submit.prevent="submit">
            <h1>Create your account</h1>
            <p class="sub">Free forever tier. No credit card required.</p>
            <label>Name
                <input v-model="name" type="text" autocomplete="name" placeholder="Your name" />
            </label>
            <label>Email
                <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
            </label>
            <label>Password
                <input v-model="pwd" type="password" autocomplete="new-password" placeholder="At least 8 characters" />
            </label>
            <p v-if="err" class="err">{{ err }}</p>
            <button type="submit" class="btn solid">Sign up — free</button>
            <p class="alt">Already have an account? <RouterLink to="/login">Log in</RouterLink></p>
            <p class="fine">Demo build: no server involved, signing up takes you straight to the editor.</p>
        </form>
    </main>
</template>
