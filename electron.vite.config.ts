/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import pkg from './package.json';

// get all workspace:* deps
const workspaceDeps = [
  ...Object.entries(pkg.dependencies || {})
    .filter(
      ([, version]) =>
        typeof version === 'string' && version.startsWith('workspace:'),
    )
    .map(([name]) => name),
];

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: {
        entry: './src/main/main.ts',
        formats: ['cjs']
      },
      rollupOptions: {
        external: [
          'electron',
          'source-map-support',
          'electron-store',
          'express',
          'cors',
          ...workspaceDeps
        ]
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: [...workspaceDeps, 'electron-store', 'express', 'cors'],
      }),
      tsconfigPaths(),
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: './src/preload/index.ts',
        formats: ['cjs']
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: [...workspaceDeps, 'electron-store'],
      }),
      tsconfigPaths(),
    ]
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          main: resolve('./src/renderer/index.html'),
        },
      },
      minify: true,
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern',
        },
      },
    },
    plugins: [react(), tsconfigPaths()],
    define: {
      APP_VERSION: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@ui-tars/shared': resolve('packages/shared/src')
      }
    }
  },
});
