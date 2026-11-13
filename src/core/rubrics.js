/**
 * Rubric definitions for the Hygiene Checker.
 * Supports:
 * 1. Rubric A: Module Lab Submission & Design Rubric (matches the module portal benchmark)
 * 2. Rubric B: Core Software Engineering & Codebase Hygiene Rubric (matches table.tsv)
 */

// The platform calculates penalties using an unrounded quantum unit:
// 12 units = 5.65 pts, meaning 1 unit = 5.65 / 12 = 0.47083333333333335 pts.
// When displayed per category with floor truncation:
// 1 unit = 0.47 pts
// 2 units = 0.94 pts
// 6 units = 2.82 pts
// Total = 5.65 pts.
export const QUANTUM_UNIT = 5.65 / 12;

export const RUBRICS = {
  lab: {
    id: 'lab',
    name: 'Module Lab Report & Design Rubric',
    description: 'Specialized for frontend, design-fidelity, accessibility, responsive UI, and module submission reports.',
    categories: [
      {
        id: 'styling_responsive',
        name: 'Styling & responsive layout',
        description: 'Mobile-first reasoning, breakpoint declarations, type scale, spacing tokens, and explicit 360px viewport considerations above the fold.',
        checks: [
          'Documented type scale, spacing tokens, and responsive breakpoints.',
          'Visual layout confirmed at 360px viewport (contact buttons and trust points above fold).',
          'No unexplained fixed pixel widths in CSS where fluid layouts or clamp() are expected.',
          'Justified layout decisions with visible screenshots or layout notes.'
        ]
      },
      {
        id: 'accessibility',
        name: 'Accessibility',
        description: 'Keyboard navigation, focus indicators, image alt text accuracy, screen-reader alerts (aria-live/role=alert), and accessible link names.',
        checks: [
          'Actual tab-order and focus-visible styles/evidence documented.',
          'Meaningful, accurate alt text for placeholder images (not misleading screen readers).',
          'Accessible names for contact links (e.g. tel:, WhatsApp, email) rather than unlabeled icon-only links.',
          'Form validation error feedback announced via aria-live or role="alert" for non-sighted users.'
        ]
      },
      {
        id: 'ui_form_ux',
        name: 'UI content & form UX',
        description: 'Purposeful interface copy, form validation states, success/error feedback, and robust fallback communication channels.',
        checks: [
          'Fallback communication channels (e.g. tel: link when WhatsApp is unavailable).',
          'Documented validation, error feedback, and post-submission success states.',
          'Clear button labels and intuitive interaction paths tied to user goals.'
        ]
      },
      {
        id: 'delivery_docs',
        name: 'Delivery & documentation',
        description: 'Complete end-to-end documentation without mid-sentence truncations, clear local setup/run steps, and clean imperative commit history.',
        checks: [
          'No truncated text, incomplete tables, or mid-sentence cut-offs in README/report.',
          'Clear, reproducible local setup and run steps ("how to run locally").',
          'Clean, imperative, scoped git commit history without noisy micro-edits ("Readme edit", "fix").',
          'Near-duplicate consecutive commits squashed or given descriptive messages.'
        ]
      },
      {
        id: 'design_fidelity',
        name: 'Design-artifact fidelity',
        description: 'Parity between wireframes/sketches (e.g. docs/sketch.png) and delivered code/markup, with clear numbering legends and documented deviations.',
        checks: [
          'Numbered blocks in design sketch match table rows / DOM sections exactly.',
          'Design deviations made during build are annotated or updated in the design artifact.',
          'Referenced design asset links (e.g. docs/sketch.png) exist and resolve correctly.'
        ]
      }
    ]
  },

  swe: {
    id: 'swe',
    name: 'Software Engineering & Codebase Hygiene Rubric',
    description: 'Standard software engineering criteria covering code quality, architecture, robustness, and testing (from table.tsv).',
    categories: [
      {
        id: 'readability_naming',
        name: 'readability & naming',
        description: 'Clear, idiomatic code with meaningful, convention-following names and consistent formatting; no cryptic names, convoluted logic, or mixed styles.'
      },
      {
        id: 'structure_architecture',
        name: 'structure & architecture',
        description: 'Modular structure with respected layer boundaries and separation of concerns; no god-classes, circular dependencies, or business logic in controllers.'
      },
      {
        id: 'correctness_robustness',
        name: 'correctness & robustness',
        description: 'Accurate code with edge cases and resources handled; no dead code, leftover debug output, leaked connections, or race conditions.'
      },
      {
        id: 'error_observability',
        name: 'error handling & observability',
        description: 'Errors handled meaningfully and logged appropriately; no empty catch blocks, swallowed exceptions, System.out debugging, or sensitive data in logs.'
      },
      {
        id: 'security_data_protection',
        name: 'security & data protection',
        description: 'Inputs validated, access controlled, and credentials externalized; no injection risks, missing authorization checks, or hardcoded secrets and tokens.'
      },
      {
        id: 'config_dependency',
        name: 'configuration & dependency hygiene',
        description: 'Externalized config and lean, declared dependencies; no hardcoded URLs or magic values, unused imports, or committed build artifacts.'
      },
      {
        id: 'api_database',
        name: 'API & database hygiene',
        description: 'Well-formed endpoints and sound data access; correct status codes, proper keys and indexes; no leaked internal fields, N+1 queries, or SELECT * misuse.'
      },
      {
        id: 'test_hygiene',
        name: 'test hygiene',
        description: 'Meaningful, passing, isolated tests covering key behavior; no skipped, commented-out, flaky, or assertion-free tests.'
      },
      {
        id: 'build_delivery_vc',
        name: 'build, delivery & version control',
        description: 'Reproducible build, green CI, and clean history; no failing builds, manual-only setup, or WIP/"fix" commit noise and committed artifacts.'
      },
      {
        id: 'doc_completeness',
        name: 'documentation & completeness',
        description: 'Clear README, setup steps, and a complete runnable submission; no missing prerequisites, broken instructions, unresolved references, or missing files.'
      }
    ]
  }
};
