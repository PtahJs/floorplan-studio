import { createApp } from "vue";
import { createWebHashHistory, createRouter } from "vue-router";
import App from "./App.vue";
import HomeView from "./views/HomeView.vue";
import PricingView from "./views/PricingView.vue";
import LoginView from "./views/LoginView.vue";
import SignupView from "./views/SignupView.vue";
import EditorView from "./views/EditorView.vue";
import "./styles/index.css";
import "./styles/site.css";

// hash history: GitHub Pages static hosting needs no server-side fallback config
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: "/", component: HomeView },
        { path: "/pricing", component: PricingView },
        { path: "/login", component: LoginView },
        { path: "/signup", component: SignupView },
        { path: "/app", component: EditorView },
        { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
    scrollBehavior: () => ({ top: 0 }),
});

createApp(App).use(router).mount("#app");
