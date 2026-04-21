## Packages
recharts | For visualizing income vs expenses data
date-fns | For reliable date formatting and manipulation
framer-motion | For smooth page transitions and micro-interactions
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility for merging Tailwind CSS classes

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  display: ["var(--font-display)"],
  body: ["var(--font-body)"],
}
Authentication uses Replit Auth blueprint.
Authenticated routes should redirect to Landing if not logged in.
Dashboard is the main authenticated view.
