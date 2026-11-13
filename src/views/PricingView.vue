<script setup>
// Pricing page (purely static): three-tier comparison + FAQ. Display only, no payment logic.
import { RouterLink } from "vue-router";

const tiers = [
    {
        name: "Free", price: "$0", per: "forever", tag: "",
        cta: "Open the editor", to: "/app", featured: false,
        items: ["Full 2D plan editor", "3D walkthrough & orbit", "55-item furniture library", "PNG & JSON export", "Plans saved on your device", "1 project"],
    },
    {
        name: "Pro", price: "$9", per: "per month", tag: "Most popular",
        cta: "Start free trial", to: "/signup", featured: true,
        items: ["Everything in Free", "Unlimited projects", "Cloud backup & sync", "Custom materials & colours", "Priority support", "High-resolution exports"],
    },
    {
        name: "Studio", price: "$29", per: "per month", tag: "",
        cta: "Contact us", to: "/signup", featured: false,
        items: ["Everything in Pro", "5 team seats", "Client sharing links", "Brand watermarks", "Bulk project management", "Phone support"],
    },
];

const faqs = [
    { q: "Is the editor really free?", a: "Yes. The Free tier includes the complete editor, 3D walkthrough and exports — no time limit. Pro adds cloud features for people who work on many projects." },
    { q: "Where are my plans stored?", a: "In the Free tier, entirely on your own device (browser local storage). Export a JSON file any time to back up or move a plan. Pro plans sync to the cloud." },
    { q: "What browsers are supported?", a: "Any modern browser with WebGPU: Chrome, Edge and others. On systems without WebGPU support the editor falls back to WebGL2 automatically." },
    { q: "Can I cancel any time?", a: "Yes. Paid plans are month-to-month, and your exported data stays yours regardless of tier." },
];
</script>

<template>
    <main class="site">
        <section class="pricing-head">
            <h1>Simple pricing</h1>
            <p class="sub">Start free. Upgrade when your projects outgrow your device.</p>
        </section>

        <section class="tiers">
            <article v-for="t in tiers" :key="t.name" class="tier" :class="{ featured: t.featured }">
                <p v-if="t.tag" class="tag">{{ t.tag }}</p>
                <h2>{{ t.name }}</h2>
                <p class="price"><span class="amount">{{ t.price }}</span> <span class="per">{{ t.per }}</span></p>
                <RouterLink :to="t.to" class="btn" :class="t.featured ? 'solid' : 'ghost'">{{ t.cta }}</RouterLink>
                <ul>
                    <li v-for="i in t.items" :key="i">{{ i }}</li>
                </ul>
            </article>
        </section>

        <section class="faq">
            <h2>Frequently asked</h2>
            <details v-for="f in faqs" :key="f.q">
                <summary>{{ f.q }}</summary>
                <p>{{ f.a }}</p>
            </details>
        </section>
    </main>
    <footer class="site-foot">
        <span>PlanCraft — online floor plan &amp; interior design</span>
        <span><RouterLink to="/">Home</RouterLink> · <RouterLink to="/login">Log in</RouterLink> · <RouterLink to="/signup">Sign up</RouterLink></span>
    </footer>
</template>
