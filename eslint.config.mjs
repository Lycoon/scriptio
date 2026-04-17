import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default [
    { ignores: ["public/**", "out/**", "src-tauri/**", ".next/**"] },
    ...coreWebVitals,
    ...typescript,
    prettier,
];
