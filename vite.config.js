import { defineApp } from "@ptahjs/build";

export default defineApp({
    framework: "vue",
    serveConfig: {
        path: "./src/ServeConfig.json",
        outputName: "ServeConfig.json",
    },
});
