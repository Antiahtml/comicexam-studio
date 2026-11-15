import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["node_modules.nosync/**", ".next.nosync/**", "data.nosync/**", "out.nosync/**", "out/**", "public/sw.js", "test-results/**", "playwright-report/**"] },
];
export default config;
