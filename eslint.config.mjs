import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["node_modules.nosync/**", ".next.nosync/**", "data.nosync/**", "test-results/**", "playwright-report/**"] },
];
export default config;
