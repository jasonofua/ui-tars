import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: 'src/main/index.ts',
            },
        },
    },
    resolve: {
        alias: {
            '@main': '/src/main',
        },
    },
}); 