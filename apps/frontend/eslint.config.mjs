import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // .next-check is where `make check` puts its verification build, so that a
  // production build cannot overwrite the dev server's chunks. It is build
  // output like .next and must be ignored the same way.
  { ignores: ["**/.next/**", "**/.next-check/**", "**/out/**", "**/build/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTypescript,
  {
    // Next 16 enables these React Compiler-oriented rules by default. Existing
    // interactive surfaces intentionally use refs for command execution, so
    // that one stays off pending a separate migration.
    //
    // `set-state-in-effect` is back on as a warning. Switching it off cost us
    // two "Maximum update depth exceeded" loops that shipped to the browser —
    // it would have flagged the first one at the keystroke. It is a warning
    // rather than an error because the async loaders legitimately setState in
    // a `.then` behind an `active` guard, and those are not the bug. Read each
    // hit; do not silence the rule again.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
