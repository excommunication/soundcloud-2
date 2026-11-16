import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        // *.helper.test.ts это помощники тестов: их импортируют, но сами по себе не запускают
        exclude: ['**/node_modules/**', '**/tsc/**', 'src/**/*.helper.test.ts'],
        // На раннере GitHub долгие цепочки поддельных таймеров не укладываются в 5 с, и падают каждый раз разные тесты.
        // В CI лимит 30 с, как у релизной сборки; локально 5 с, чтобы зависший тест было видно сразу
        testTimeout: process.env.CI ? 30000 : 5000,
    },
});
