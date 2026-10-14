import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:60000,use:{baseURL:'http://127.0.0.1:5173',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chromium',viewport:{width:1440,height:1000},screenshot:'only-on-failure'},reporter:'list',workers:1});
