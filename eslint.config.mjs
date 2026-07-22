import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
    // `landing/` is a standalone app with its own config — lint it there, not here.
    { ignores: ["public/**", "out/**", "src-tauri/**", ".next/**", "landing/**"] },
    ...coreWebVitals,
    ...typescript,
    prettier,
];
export default config;
