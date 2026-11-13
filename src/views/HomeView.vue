<script setup>
// Home page (purely static marketing page): hero + feature highlights + three-step flow + CTA. Placeholder graphics for the screenshots for now.
import { RouterLink } from "vue-router";

const features = [
    { icon: "📐", title: "Precise 2D plan editor", body: "Draw walls, place doors and windows, add dimensions — all in millimetres, with grid snapping and wall-attachment built in. Load-bearing walls are protected automatically." },
    { icon: "🏙️", title: "One-click 3D walkthrough", body: "Your plan grows into a full 3D home with walls, ceilings, glass and shadows. Orbit it, cut walls open, or walk through it first-person — day and night." },
    { icon: "🛋️", title: "55-item furniture library", body: "Beds, sofas, kitchen islands, appliances and more, each modelled in real dimensions. Drag onto the plan and the 3D scene updates instantly." },
    { icon: "🎨", title: "Materials & daylight", body: "Switch floor and wall materials, move the sun across the sky from 7:00 to 18:00, or switch to a night scene with lamps that actually light up." },
    { icon: "📤", title: "Export & share", body: "Export your plan as a scaled PNG, or the whole design as JSON to back up, share and re-import later. Works offline in your browser." },
    { icon: "🌐", title: "Runs anywhere", body: "WebGPU-powered rendering in the browser — no installs, no plugins. Your plans are stored locally on your own device." },
];

const steps = [
    { n: "1", title: "Start from a plan", body: "Open the editor and begin with the default three-bedroom layout, or draw your own from scratch on the millimetre grid." },
    { n: "2", title: "Furnish & style", body: "Drag in furniture, adjust sizes with handles, recolour, rotate, and pick floor materials room by room." },
    { n: "3", title: "Walk through in 3D", body: "Press T to grow your plan into a 3D home. Orbit, cut, walk, and export the result." },
];
</script>

<template>
    <main class="site">
        <section class="hero">
            <p class="eyebrow">WebGPU · Vue 3 · no install</p>
            <h1>Design your home<br />in <em>2D</em>, walk it in <em>3D</em></h1>
            <p class="sub">PlanCraft turns a millimetre-accurate floor plan into a live 3D interior — walls grow, furniture drops in, sunlight moves. All in your browser.</p>
            <div class="cta-row">
                <RouterLink to="/app" class="btn solid big">Open the editor — free</RouterLink>
                <RouterLink to="/pricing" class="btn ghost big">See pricing</RouterLink>
            </div>
            <div class="hero-shot" aria-hidden="true">
                <div class="shot paper">
                    <svg viewBox="0 0 560 300" class="plan-doodle">
                        <rect x="20" y="20" width="520" height="260" fill="none" stroke="#2b2824" stroke-width="7" />
                        <line x1="230" y1="20" x2="230" y2="150" stroke="#2b2824" stroke-width="4" />
                        <line x1="230" y1="150" x2="380" y2="150" stroke="#b5653a" stroke-width="4" stroke-dasharray="8 4" />
                        <line x1="380" y1="150" x2="380" y2="280" stroke="#2b2824" stroke-width="4" />
                        <rect x="60" y="50" width="120" height="70" fill="#c9d6df" rx="4" />
                        <rect x="280" y="180" width="180" height="80" fill="#b7c4b0" rx="4" />
                        <circle cx="450" cy="80" r="26" fill="#a9c39b" />
                        <text x="120" y="175" font-size="15" fill="#8a8174" text-anchor="middle">Bedroom</text>
                        <text x="370" y="235" font-size="15" fill="#8a8174" text-anchor="middle">Living</text>
                    </svg>
                </div>
                <div class="shot dark">
                    <div class="fake3d">
                        <div class="wall w1"></div><div class="wall w2"></div><div class="wall w3"></div>
                        <div class="floor"></div>
                        <div class="box b1"></div><div class="box b2"></div>
                    </div>
                </div>
            </div>
        </section>

        <section class="features">
            <h2>Everything you need to redesign a home</h2>
            <div class="grid">
                <article v-for="f in features" :key="f.title" class="card">
                    <div class="icon">{{ f.icon }}</div>
                    <h3>{{ f.title }}</h3>
                    <p>{{ f.body }}</p>
                </article>
            </div>
        </section>

        <section class="steps">
            <h2>Three steps from sketch to walkthrough</h2>
            <ol>
                <li v-for="s in steps" :key="s.n">
                    <span class="n">{{ s.n }}</span>
                    <h3>{{ s.title }}</h3>
                    <p>{{ s.body }}</p>
                </li>
            </ol>
        </section>

        <section class="final-cta">
            <h2>Ready to rearrange your home?</h2>
            <RouterLink to="/app" class="btn solid big">Open the editor</RouterLink>
            <p class="fine">Free while in beta · runs entirely in your browser · nothing to install</p>
        </section>
    </main>
    <footer class="site-foot">
        <span>PlanCraft — online floor plan &amp; interior design</span>
        <span><RouterLink to="/pricing">Pricing</RouterLink> · <RouterLink to="/login">Log in</RouterLink> · <RouterLink to="/signup">Sign up</RouterLink></span>
    </footer>
</template>
