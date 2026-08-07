import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // .next-check is where `make check` puts its verification build, so that a
  // production build cannot overwrite the dev server's chunks. It is build
  // output like .next and must be ignored the same way.
  { ignores: [".next/**", ".next-check/**", "out/**", "build/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTypescript,
  {
    // Next 16 enables these React Compiler-oriented rules by default. Existing
    // interactive surfaces intentionally use refs for command execution and
    // effect-driven request state; migrate those patterns separately rather
    // than coupling a behavioral rewrite to the framework upgrade.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
